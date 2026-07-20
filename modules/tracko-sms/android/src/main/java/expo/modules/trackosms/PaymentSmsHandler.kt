package expo.modules.trackosms

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat

object PaymentSmsHandler {
  private const val TAG = "TrackoSms"

  fun handle(context: Context, body: String, sender: String?) {
    val appContext = context.applicationContext
    if (
      ContextCompat.checkSelfPermission(appContext, android.Manifest.permission.RECEIVE_SMS)
      != PackageManager.PERMISSION_GRANTED
    ) {
      PaymentDebugStore.record(appContext, body, sender, null, "receive_sms_denied")
      Log.w(TAG, "Ignoring SMS because RECEIVE_SMS is not granted")
      return
    }

    val transaction = PaymentParser.parse(body, sender)
    PaymentDebugStore.record(
      appContext,
      body,
      sender,
      transaction,
      if (transaction == null) "parser_rejected" else "accepted",
    )
    if (transaction == null) {
      Log.d(TAG, "SMS ignored by parser: ${body.take(120)}")
      return
    }
    if (!PendingTransactionStore.add(appContext, transaction)) {
      Log.d(TAG, "Duplicate SMS ignored for ${transaction.fingerprint}")
      return
    }

    Log.i(TAG, "Payment detected: ${transaction.amount} at ${transaction.merchant}")
    if (!TrackoSmsModule.emitIfForeground(appContext, transaction)) {
      PaymentOverlayManager.show(appContext, transaction)
    }
  }
}
