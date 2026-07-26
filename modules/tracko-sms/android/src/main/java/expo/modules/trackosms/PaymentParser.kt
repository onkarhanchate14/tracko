package expo.modules.trackosms

import java.time.Instant
import java.util.regex.Pattern

object PaymentParser {

  // ─── Amount patterns (ordered by reliability) ───────────────────────────────
  private val amountPatterns = listOf(
    // ₹1,234.56  or  Rs. 1,234.56  or  INR 1234.56
    Pattern.compile("(?i)(?:₹|rs\\.?|inr)\\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"),
    // 1234.56 Rs / 1,234.56 INR
    Pattern.compile("(?i)([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)\\s*(?:₹|rs\\.?|inr)"),
    // "debited for Rs.500.00" / "spent Rs 250" / "paid INR 99.00"
    Pattern.compile("(?i)(?:debited|debit|spent|paid|sent|withdrawn|purchase(?:d)?)\\s+(?:for\\s+|of\\s+|with\\s+)?(?:₹|rs\\.?|inr)?\\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"),
    // "is debited for Rs.500.00"
    Pattern.compile("(?i)is\\s+debited\\s+for\\s+(?:₹|rs\\.?|inr)?\\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"),
    // "debited with INR 46,000.00"
    Pattern.compile("(?i)debited\\s+with\\s+(?:₹|rs\\.?|inr)?\\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"),
    // Fallback – any amount after common debit verbs
    Pattern.compile("(?i)(?:debited|spent|paid|sent)\\s+(?:₹|rs\\.?|inr)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)"),
  )

  // ─── Merchant / payee patterns ──────────────────────────────────────────────
  private val merchantPatterns = listOf(
    // "to MERCHANT" / "at MERCHANT" / "towards MERCHANT" / "for MERCHANT"
    Pattern.compile(
      "(?i)\\b(?:to|at|towards|for|on|via)\\s+([A-Z0-9][A-Z0-9 .&'_\\-]{1,50}?)(?=\\s*(?:via|upi|ref|txn|from|avl|a/c|account|bal|balance|on|info|utr|rrn|,|\\.|$))",
    ),
    // UPI style: "credited to vpa xyz@ybl" or "to vpa ..."
    Pattern.compile("(?i)(?:to|credited to)\\s+(?:vpa\\s+)?([a-z0-9.\\-_]+@[a-z0-9.\\-_]+)"),
    // "Info: UPI/MERCHANT/..." or "UPI/P2M/MERCHANT"
    Pattern.compile("(?i)(?:UPI|IMPS|NEFT|RTGS)[\\s/]+(?:P2[AM]/s/]+)?([A-Z0-9][A-Z0-9 .&'_\\-]{2,40})"),
    // "purchase at SWIGGY" / "using Debit Card at ..."
    Pattern.compile("(?i)(?:purchase|spent|paid)\\s+(?:at|on)\\s+([A-Z0-9][A-Z0-9 .&'_\\-]{2,40})"),
  )

  // ─── Strong positive signals that this is a real debit alert ─────────────────
  private val debitKeywords = listOf(
    "debited", "debit", "spent", "paid", "payment", "sent",
    "withdrawn", "purchase", "purchased", "txn", "transaction"
  )

  // ─── Hard exclusions (never treat as expense) ───────────────────────────────
  private val excludeKeywords = listOf(
    "otp", "one time password", "one-time password",
    "credited", "credit alert", "has been credited", "received from",
    "received a payment", "you have received", "money received",
    "refund", "reversed", "reversal", "failed", "declined", "unsuccessful",
    "insufficient", "kyc", "update kyc", "account blocked", "account will be blocked",
    "suspicious", "verify immediately", "click here", "bit.ly", "tinyurl",
    "congratulations", "won", "cashback", "reward", "claim now"
  )

  // ─── Account / reference hints (boost confidence) ───────────────────────────
  private val accountHintPattern = Pattern.compile(
    "(?i)(?:a/c|a\\.?c|account|acct|xx|xxxx|\\*\\*\\*)\\s*[x*0-9]{2,}"
  )
  private val refHintPattern = Pattern.compile(
    "(?i)(?:upi\\s*ref|ref\\s*no|utr|rrn|txn\\s*id|reference)\\s*[:#]?\\s*[a-z0-9]{6,}"
  )

  fun parse(message: String, sender: String?): PaymentTransaction? {
    val normalized = message.replace(Regex("\\s+"), " ").trim()
    if (normalized.length < 25) return null          // too short to be a real bank SMS

    val lower = normalized.lowercase()

    // 1. Hard exclusions first
    if (excludeKeywords.any { lower.contains(it) }) return null

    // 2. Must contain at least one clear debit keyword
    if (!debitKeywords.any { lower.contains(it) }) return null

    // 3. Extract amount – mandatory
    val amount = extractAmount(normalized) ?: return null
    if (amount <= 0.0 || amount > 50_00_000.0) return null   // sanity limit

    // 4. Confidence boosters (optional but preferred)
    val hasAccountHint = accountHintPattern.matcher(normalized).find()
    val hasRefHint = refHintPattern.matcher(normalized).find()
    val hasBalanceHint = lower.contains("avl") || lower.contains("available") || lower.contains("bal")

    // If the message is very weak (no account / ref / balance) we still accept it
    // only when amount + debit keyword are present, but merchant will be generic.

    // 5. Extract merchant
    val merchant = extractMerchant(normalized)
      ?.take(60)
      ?.ifBlank { null }
      ?: "UPI payment"

    return PaymentTransaction(
      merchant = merchant,
      amount = amount,
      category = suggestCategory(merchant),
      bank = sender?.takeIf { it.isNotBlank() },
      occurredAt = Instant.now().toString(),
      fingerprint = PaymentTransaction.fingerprint("$sender|$normalized"),
      rawBody = message.take(500),
    )
  }

  private fun extractAmount(message: String): Double? {
    for (pattern in amountPatterns) {
      val matcher = pattern.matcher(message)
      if (matcher.find()) {
        val raw = matcher.group(1)?.replace(",", "") ?: continue
        val value = raw.toDoubleOrNull()
        if (value != null && value > 0) return value
      }
    }
    return null
  }

  private fun extractMerchant(message: String): String? {
    for (pattern in merchantPatterns) {
      val matcher = pattern.matcher(message)
      if (matcher.find()) {
        val candidate = matcher.group(1)
          ?.trim()
          ?.trimEnd('.', ',', '-', ' ')
          ?.replace(Regex("\\s+"), " ")
          ?: continue

        // Filter out pure numbers / refs / common noise
        if (candidate.length < 2) continue
        if (candidate.matches(Regex("^[0-9xX*]+$"))) continue
        if (candidate.lowercase() in listOf("upi", "imps", "neft", "rtgs", "pos", "atm", "card")) continue

        return candidate
      }
    }
    return null
  }

  private fun suggestCategory(merchant: String): String {
    val value = merchant.lowercase()
    return when {
      listOf("swiggy", "zomato", "restaurant", "cafe", "coffee", "pizza", "dominos", "mcdonald", "kfc", "burger", "food").any(value::contains) -> "Food"
      listOf("uber", "ola", "metro", "rapido", "irctc", "makemytrip", "goibibo", "redbus", "indigo", "airindia", "vistara").any(value::contains) -> "Travel"
      listOf("fuel", "petrol", "diesel", "hpcl", "iocl", "bpcl", "shell", "indian oil").any(value::contains) -> "Fuel"
      listOf("apollo", "pharmacy", "medical", "hospital", "clinic", "medplus", "1mg", "netmeds").any(value::contains) -> "Medical"
      listOf("electricity", "broadband", "recharge", "insurance", "airtel", "jio", "vi ", "bsnl", "tata play", "dth").any(value::contains) -> "Bills"
      listOf("mart", "grocery", "supermarket", "blinkit", "zepto", "bigbasket", "dmart", "reliance", "more ").any(value::contains) -> "Grocery"
      listOf("amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "shopclues").any(value::contains) -> "Shopping"
      listOf("netflix", "spotify", "hotstar", "prime", "youtube", "sony liv", "zee5").any(value::contains) -> "Entertainment"
      else -> "Others"
    }
  }
}