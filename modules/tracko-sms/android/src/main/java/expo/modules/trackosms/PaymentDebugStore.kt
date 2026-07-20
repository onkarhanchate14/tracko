package expo.modules.trackosms

import android.content.Context
import org.json.JSONObject
import java.time.Instant

object PaymentDebugStore {
  private const val PREFS = "tracko_sms_debug"
  private const val KEY = "last"

  fun record(
    context: Context,
    body: String,
    sender: String?,
    transaction: PaymentTransaction?,
    status: String,
  ) {
    val payload = JSONObject()
      .put("receivedAt", Instant.now().toString())
      .put("sender", sender)
      .put("body", body.take(500))
      .put("status", status)
      .put("parsed", transaction != null)
    transaction?.let {
      payload
        .put("merchant", it.merchant)
        .put("amount", it.amount)
        .put("category", it.category)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY, payload.toString())
      .apply()
  }

  fun last(context: Context): Map<String, Any?>? = try {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    val json = JSONObject(raw)
    mapOf(
      "receivedAt" to json.optString("receivedAt"),
      "sender" to json.optString("sender").ifBlank { null },
      "body" to json.optString("body"),
      "status" to json.optString("status"),
      "parsed" to json.optBoolean("parsed"),
      "merchant" to json.optString("merchant").ifBlank { null },
      "amount" to if (json.has("amount")) json.getDouble("amount") else null,
      "category" to json.optString("category").ifBlank { null },
    )
  } catch (_: Exception) {
    null
  }
}
