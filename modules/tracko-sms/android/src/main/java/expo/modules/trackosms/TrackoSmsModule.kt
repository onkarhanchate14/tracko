package expo.modules.trackosms

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class TrackoSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TrackoSms")
    Events("onPaymentReceived")

    OnCreate {
      instance = WeakReference(this@TrackoSmsModule)
      captureLaunchIntent(appContext.currentActivity?.intent)
    }
    OnDestroy {
      if (instance?.get() === this@TrackoSmsModule) instance = null
    }
    OnActivityEntersForeground {
      isForeground = true
      captureLaunchIntent(appContext.currentActivity?.intent)
    }
    OnActivityEntersBackground { isForeground = false }
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
    Function("markTransactionImported") { id: String ->
      appContext.reactContext?.let { PendingTransactionStore.updateStatus(it, id, "imported") }
    }
    Function("openOverlaySettings") {
      appContext.reactContext?.let { PaymentOverlayManager.openOverlaySettings(it) }
    }
    Function("getOverlayPermissionStatus") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }
  }

  private fun sendPayment(transaction: PaymentTransaction) {
    sendEvent("onPaymentReceived", transaction.toMap())
  }

  companion object {
    private const val LAUNCH_TRANSACTION_EXTRA = "trackoTransactionId"
    private var instance: WeakReference<TrackoSmsModule>? = null
    @Volatile private var isForeground = false
    @Volatile private var launchTransactionId: String? = null

    fun emitIfForeground(transaction: PaymentTransaction): Boolean {
      val module = instance?.get() ?: return false
      if (!isForeground) return false
      Handler(Looper.getMainLooper()).post { module.sendPayment(transaction) }
      return true
    }

    private fun captureLaunchIntent(intent: Intent?) {
      val id = intent?.getStringExtra(LAUNCH_TRANSACTION_EXTRA) ?: return
      launchTransactionId = id
      intent.removeExtra(LAUNCH_TRANSACTION_EXTRA)
    }
  }
}
