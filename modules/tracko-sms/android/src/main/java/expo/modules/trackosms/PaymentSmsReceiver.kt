package expo.modules.trackosms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class PaymentSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) return
    val body = messages.joinToString("") { it.messageBody ?: "" }
    val transaction = PaymentParser.parse(body, messages.first().originatingAddress) ?: return
    if (!PendingTransactionStore.add(context, transaction)) return
    if (TrackoSmsModule.emitIfForeground(transaction)) return
    PaymentOverlayManager.show(context, transaction)
  }
}
