package expo.modules.trackosms

import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

data class PaymentTransaction(
  val id: String = UUID.randomUUID().toString(),
  val merchant: String,
  val amount: Double,
  val category: String,
  val bank: String?,
  val occurredAt: String,
  val fingerprint: String,
  val status: String = "pending"
) {
  fun toJson() = JSONObject().apply {
    put("id", id)
    put("merchant", merchant)
    put("amount", amount)
    put("category", category)
    put("bank", bank)
    put("occurredAt", occurredAt)
    put("fingerprint", fingerprint)
    put("status", status)
  }

  fun toMap() = mapOf(
    "id" to id,
    "merchant" to merchant,
    "amount" to amount,
    "category" to category,
    "bank" to bank,
    "occurredAt" to occurredAt,
    "status" to status
  )

  companion object {
    fun fromJson(json: JSONObject) = PaymentTransaction(
      id = json.getString("id"),
      merchant = json.getString("merchant"),
      amount = json.getDouble("amount"),
      category = json.getString("category"),
      bank = json.optString("bank").ifBlank { null },
      occurredAt = json.getString("occurredAt"),
      fingerprint = json.getString("fingerprint"),
      status = json.optString("status", "pending")
    )

    fun fingerprint(value: String): String {
      val bytes = MessageDigest.getInstance("SHA-256").digest(value.lowercase().toByteArray())
      return bytes.joinToString("") { "%02x".format(it) }
    }
  }
}
