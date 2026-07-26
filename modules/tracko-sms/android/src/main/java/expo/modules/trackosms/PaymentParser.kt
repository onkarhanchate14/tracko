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
    // Fallback
    Pattern.compile("(?i)(?:debited|spent|paid|sent)\\s+(?:₹|rs\\.?|inr)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)"),
  )

  // ─── Merchant / payee patterns ──────────────────────────────────────────────
  private val merchantPatterns = listOf(
    // "to MERCHANT" / "at MERCHANT" / "towards MERCHANT" / "for MERCHANT"
    Pattern.compile(
      "(?i)\\b(?:to|at|towards|for|on|via)\\s+([A-Z0-9][A-Z0-9 .&'_\\-]{1,50}?)(?=\\s*(?:via|upi|ref|txn|from|avl|a/c|account|bal|balance|on|info|utr|rrn|,|\\.|$))"
    ),
    // UPI style: "credited to vpa xyz@ybl" or "to vpa ..."
    Pattern.compile("(?i)(?:to|credited to)\\s+(?:vpa\\s+)?([a-z0-9.\\-_]+@[a-z0-9.\\-_]+)"),
    // "Info: UPI/MERCHANT/..." or "UPI/P2M/MERCHANT"
    Pattern.compile("(?i)(?:UPI|IMPS|NEFT|RTGS)[\\s/]+(?:P2[AM]/s/]+)?([A-Z0-9][A-Z0-9 .&'_\\-]{2,40})"),
    // "purchase at SWIGGY" / "using Debit Card at ..."
    Pattern.compile("(?i)(?:purchase|spent|paid)\\s+(?:at|on)\\s+([A-Z0-9][A-Z0-9 .&'_\\-]{2,40})"),
    // ICICI style: "NEW SANJEEV MED credited"
    Pattern.compile("(?i),\\s*([A-Z0-9][A-Z0-9 .&'_\\-]{2,40})\\s+credited"),
  )

  // ─── Strong positive signals ────────────────────────────────────────────────
  private val debitKeywords = listOf(
    "debited", "debit", "spent", "paid", "payment", "sent",
    "withdrawn", "purchase", "purchased", "txn", "transaction"
  )

  // ─── Hard exclusions (safe ones) ────────────────────────────────────────────
  private val excludeKeywords = listOf(
    "otp", "one time password", "one-time password",
    "credit alert", "has been credited", "received from",
    "received a payment", "you have received", "money received",
    "refund", "reversed", "reversal", "failed", "declined", "unsuccessful",
    "insufficient", "kyc", "update kyc", "account blocked", "account will be blocked",
    "suspicious", "verify immediately", "click here", "bit.ly", "tinyurl",
    "congratulations", "won", "cashback", "reward", "claim now"
  )

  // ─── Detect if "credited" means credit to the USER ──────────────────────────
  private fun isCreditToUser(message: String): Boolean {
    val lower = message.lowercase()

    val creditToUserPatterns = listOf(
      Regex("""(?i)\b(?:has been|was|is)\s+credited\b"""),
      Regex("""(?i)\bcredited\s+to\s+(?:your|a/c|acct|account)\b"""),
      Regex("""(?i)\b(?:a/c|acct|account).{0,30}credited\b"""),
      Regex("""(?i)\byou\s+(?:have\s+)?received\b"""),
      Regex("""(?i)\breceived\s+(?:from|a payment)\b"""),
      Regex("""(?i)\bcredited\s+to\s+a/c\b""")
    )

    return creditToUserPatterns.any { it.containsMatchIn(lower) }
  }

  fun parse(message: String, sender: String?): PaymentTransaction? {
    val normalized = message.replace(Regex("\\s+"), " ").trim()
    if (normalized.length < 25) return null

    val lower = normalized.lowercase()

    // 1. Hard exclusions
    if (excludeKeywords.any { lower.contains(it) }) return null

    // 2. Special handling for the word "credited"
    if (lower.contains("credited") && isCreditToUser(normalized)) return null

    // 3. Must contain at least one clear debit keyword
    if (!debitKeywords.any { lower.contains(it) }) return null

    // 4. Extract amount – mandatory
    val amount = extractAmount(normalized) ?: return null
    if (amount <= 0.0 || amount > 50_00_000.0) return null

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
      listOf("apollo", "pharmacy", "medical", "hospital", "clinic", "medplus", "1mg", "netmeds", "med").any(value::contains) -> "Medical"
      listOf("electricity", "broadband", "recharge", "insurance", "airtel", "jio", "vi ", "bsnl", "tata play", "dth").any(value::contains) -> "Bills"
      listOf("mart", "grocery", "supermarket", "blinkit", "zepto", "bigbasket", "dmart", "reliance", "more ").any(value::contains) -> "Grocery"
      listOf("amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "shopclues").any(value::contains) -> "Shopping"
      listOf("netflix", "spotify", "hotstar", "prime", "youtube", "sony liv", "zee5").any(value::contains) -> "Entertainment"
      else -> "Others"
    }
  }
}