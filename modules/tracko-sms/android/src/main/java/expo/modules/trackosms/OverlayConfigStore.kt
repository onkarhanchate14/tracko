package expo.modules.trackosms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mirror of the JS-side category / people lists and the learned merchant -> category
 * map, so the native overlay (which can run while the app process is dead) can render
 * selectable chips and pre-select a sensible category.
 */
object OverlayConfigStore {
  private const val PREFS = "tracko_overlay_config"
  private const val KEY = "config"

  fun save(
    context: Context,
    categories: List<String>,
    people: List<String>,
    defaultPerson: String?,
    merchantCategories: Map<String, String>,
  ) {
    val payload = JSONObject()
      .put("categories", JSONArray(categories))
      .put("people", JSONArray(people))
      .put("defaultPerson", defaultPerson)
      .put("merchantCategories", JSONObject(merchantCategories as Map<*, *>))
    context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY, payload.toString())
      .apply()
  }

  private fun read(context: Context): JSONObject? = try {
    val raw = context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY, null) ?: return null
    JSONObject(raw)
  } catch (_: Exception) {
    null
  }

  fun categories(context: Context): List<String> = readList(context, "categories")
  fun people(context: Context): List<String> = readList(context, "people")

  fun defaultPerson(context: Context): String? =
    read(context)?.optString("defaultPerson")?.ifBlank { null }

  fun learnedCategory(context: Context, merchant: String): String? {
    val map = read(context)?.optJSONObject("merchantCategories") ?: return null
    val key = merchant.trim().lowercase()
    return if (map.has(key)) map.optString(key).ifBlank { null } else null
  }

  private fun readList(context: Context, field: String): List<String> {
    val array = read(context)?.optJSONArray(field) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optString(it).ifBlank { null } }
  }
}
