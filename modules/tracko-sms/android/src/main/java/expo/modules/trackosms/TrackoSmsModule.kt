package expo.modules.trackosms

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.provider.Telephony
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class TrackoSmsModule : Module() {
  private var dynamicReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("TrackoSms")
    Events("onPaymentReceived")

    OnCreate {
      instance = WeakReference(this@TrackoSmsModule)
      // Do NOT assume foreground here: the process can be started headlessly by the
      // SMS broadcast while no activity is visible. Foreground is set only once an
      // activity actually resumes (OnActivityEntersForeground).
      captureLaunchIntent(appContext.currentActivity?.intent)
      registerDynamicReceiver()
    }
    OnDestroy {
      unregisterDynamicReceiver()
      if (instance?.get() === this@TrackoSmsModule) instance = null
    }
    OnActivityEntersForeground {
      isForeground = true
      appContext.reactContext?.let { PaymentOverlayManager.remove(it) }
      captureLaunchIntent(appContext.currentActivity?.intent)
    }
    OnActivityEntersBackground {
      isForeground = false
    }
    OnNewIntent { intent -> captureLaunchIntent(intent) }

    Function("getPendingTransactions") {
      PendingTransactionStore.pending(appContext.reactContext ?: return@Function emptyList<Map<String, Any?>>()).map { it.toMap() }
    }
    Function("getOverlaySavedTransactions") {
      PendingTransactionStore.overlaySaved(appContext.reactContext ?: return@Function emptyList<Map<String, Any?>>()).map { it.toMap() }
    }
    Function("consumeLaunchTransaction") {
      val context = appContext.reactContext ?: return@Function null
      val id = launchTransactionId ?: return@Function null
      launchTransactionId = null
      PendingTransactionStore.findById(context, id)?.toMap()
    }
    Function("getLastSmsDebug") {
      val context = appContext.reactContext ?: return@Function null
      PaymentDebugStore.last(context)
    }
    Function("getTrackingDiagnostics") {
      val context = appContext.reactContext ?: return@Function emptyMap<String, Any?>()
      mapOf(
        "nativeModuleReady" to true,
        "overlayPermissionGranted" to getOverlayPermissionStatus(context),
        "pendingCount" to PendingTransactionStore.pending(context).size,
        "lastSms" to PaymentDebugStore.last(context),
      )
    }
    Function("markTransactionImported") { id: String ->
      appContext.reactContext?.let { PendingTransactionStore.updateStatus(it, id, "imported") }
    }
    Function("openOverlaySettings") {
      appContext.reactContext?.let { PaymentOverlayManager.openOverlaySettings(it) }
    }
    Function("getOverlayPermissionStatus") {
      val context = appContext.reactContext ?: return@Function false
      getOverlayPermissionStatus(context)
    }
  }

  private fun getOverlayPermissionStatus(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
  }

  private fun registerDynamicReceiver() {
    val context = appContext.reactContext?.applicationContext ?: return
    if (dynamicReceiver != null) return

    dynamicReceiver = PaymentSmsReceiver()
    val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
      priority = 999
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(
          dynamicReceiver,
          filter,
          android.Manifest.permission.BROADCAST_SMS,
          null,
          Context.RECEIVER_EXPORTED,
        )
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(
          dynamicReceiver,
          filter,
          android.Manifest.permission.BROADCAST_SMS,
          null,
        )
      }
      Log.i(TAG, "Dynamic SMS receiver registered")
    } catch (error: Exception) {
      Log.e(TAG, "Failed to register dynamic SMS receiver", error)
    }
  }

  private fun unregisterDynamicReceiver() {
    val context = appContext.reactContext?.applicationContext ?: return
    dynamicReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    dynamicReceiver = null
  }

  private fun sendPayment(transaction: PaymentTransaction) {
    sendEvent("onPaymentReceived", transaction.toMap())
  }

  companion object {
    private const val TAG = "TrackoSms"
    private const val LAUNCH_TRANSACTION_EXTRA = "trackoTransactionId"
    private var instance: WeakReference<TrackoSmsModule>? = null
    @Volatile private var launchTransactionId: String? = null
    @Volatile private var isForeground: Boolean = false

    fun emitIfForeground(context: Context, transaction: PaymentTransaction): Boolean {
      // Only deliver in-app when the activity is genuinely resumed. The lifecycle
      // flag is authoritative; the process-importance check is a defensive fallback.
      val foreground = isForeground && isAppInForeground(context)
      if (!foreground) return false
      val module = instance?.get() ?: return false
      Handler(Looper.getMainLooper()).post { module.sendPayment(transaction) }
      Log.i(TAG, "Forwarded payment to React while app is foreground")
      return true
    }

    private fun isAppInForeground(context: Context): Boolean {
      return try {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val processes = manager.runningAppProcesses ?: return false
        processes.any {
          it.processName == context.packageName &&
            it.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        }
      } catch (_: Exception) {
        false
      }
    }

    private fun captureLaunchIntent(intent: Intent?) {
      val id = intent?.getStringExtra(LAUNCH_TRANSACTION_EXTRA) ?: return
      launchTransactionId = id
      intent.removeExtra(LAUNCH_TRANSACTION_EXTRA)
    }
  }
}
