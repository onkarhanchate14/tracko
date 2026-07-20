package expo.modules.trackosms

import android.content.Context
import org.json.JSONArray

object PendingTransactionStore {
  private const val PREFS = "tracko_sms_transactions"
  private const val KEY = "transactions"

  fun add(context: Context, transaction: PaymentTransaction): Boolean {
    val current = all(context)
    if (current.any { it.fingerprint == transaction.fingerprint }) return false
    write(context, (listOf(transaction) + current).take(50))
    return true
  }

  fun pending(context: Context) = all(context).filter { it.status == "pending" }
  fun overlaySaved(context: Context) = all(context).filter { it.status == "overlay_saved" }
  fun findById(context: Context, id: String) = all(context).firstOrNull { it.id == id }

  fun updateStatus(context: Context, id: String, status: String) {
    write(context, all(context).map { if (it.id == id) it.copy(status = status) else it })
  }

  private fun all(context: Context): List<PaymentTransaction> = try {
    val values = JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"))
    (0 until values.length()).map { PaymentTransaction.fromJson(values.getJSONObject(it)) }
  } catch (_: Exception) { emptyList() }

  private fun write(context: Context, values: List<PaymentTransaction>) {
    val array = JSONArray()
    values.forEach { array.put(it.toJson()) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).apply()
  }
}
