package expo.modules.trackosms

import java.time.Instant
import java.util.regex.Pattern

object PaymentParser {
  private val amountPattern = Pattern.compile("(?i)(?:₹|rs\\.?|inr)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)")
  private val merchantPattern = Pattern.compile("(?i)\\b(?:to|at|towards|for)\\s+([a-z0-9][a-z0-9 .&'_-]{1,55}?)(?=\\s*(?:via|upi|ref|txn|on|from|avl|a/c|account)\\b|[,.]|$)")

  fun parse(message: String, sender: String?): PaymentTransaction? {
    val normalized = message.replace(Regex("\\s+"), " ").trim()
    val lower = normalized.lowercase()
    if (lower.contains("otp") || lower.contains("one time password") || lower.contains("credited") || lower.contains("credit alert")) return null
    if (!listOf("debited", "spent", "paid", "payment", "sent").any(lower::contains)) return null

    val amountMatch = amountPattern.matcher(normalized)
    if (!amountMatch.find()) return null
    val amount = amountMatch.group(1).replace(",", "").toDoubleOrNull() ?: return null
    if (amount <= 0) return null

    val merchantMatch = merchantPattern.matcher(normalized)
    val merchant = if (merchantMatch.find()) merchantMatch.group(1).trim().trimEnd('.', ',') else "UPI payment"
    return PaymentTransaction(
      merchant = merchant.take(60),
      amount = amount,
      category = suggestCategory(merchant),
      bank = sender?.takeIf { it.isNotBlank() },
      occurredAt = Instant.now().toString(),
      fingerprint = PaymentTransaction.fingerprint("$sender|$normalized")
    )
  }

  private fun suggestCategory(merchant: String): String {
    val value = merchant.lowercase()
    return when {
      listOf("swiggy", "zomato", "restaurant", "cafe", "coffee", "pizza").any(value::contains) -> "Food"
      listOf("uber", "ola", "metro", "rapido", "irctc").any(value::contains) -> "Travel"
      listOf("fuel", "petrol", "hpcl", "iocl").any(value::contains) -> "Fuel"
      listOf("apollo", "pharmacy", "medical", "hospital").any(value::contains) -> "Medical"
      listOf("electricity", "broadband", "recharge", "insurance").any(value::contains) -> "Bills"
      listOf("mart", "grocery", "supermarket", "blinkit", "zepto").any(value::contains) -> "Grocery"
      else -> "Others"
    }
  }
}
