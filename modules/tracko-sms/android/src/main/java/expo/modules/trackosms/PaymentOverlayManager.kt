package expo.modules.trackosms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

object PaymentOverlayManager {
  private const val TAG = "TrackoSms"
  private const val CHANNEL_ID = "tracko_payment_prompts"
  private var overlay: View? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val brand = Color.rgb(29, 109, 64)
  private val chipIdle = Color.rgb(238, 240, 236)
  private val chipIdleText = Color.rgb(89, 99, 91)

  fun show(context: Context, transaction: PaymentTransaction) {
    val appContext = context.applicationContext
    mainHandler.post {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(appContext)) {
        showOverlay(appContext, transaction)
      } else {
        showNotification(appContext, transaction)
      }
    }
  }

  private fun dp(context: Context, value: Int) =
    (value * context.resources.displayMetrics.density).toInt()

  private fun rounded(color: Int, radius: Float) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
  }

  private fun showOverlay(context: Context, transaction: PaymentTransaction) {
    remove(context)

    val categories = OverlayConfigStore.categories(context)
    val people = OverlayConfigStore.people(context)
    val defaultPerson = OverlayConfigStore.defaultPerson(context)

    var selectedCategory = transaction.category
    var selectedPerson = when {
      defaultPerson != null && people.contains(defaultPerson) -> defaultPerson
      people.isNotEmpty() -> people.first()
      else -> null
    }
    val categoryChips = HashMap<String, TextView>()
    val peopleChips = HashMap<String, TextView>()

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(context, 20), dp(context, 18), dp(context, 20), dp(context, 14))
      background = rounded(Color.WHITE, dp(context, 24).toFloat())
      elevation = dp(context, 12).toFloat()
    }

    container.addView(TextView(context).apply {
      text = "New payment detected"
      setTextColor(Color.rgb(90, 105, 94))
      textSize = 12f
    })
    container.addView(TextView(context).apply {
      text = transaction.merchant
      setTextColor(Color.rgb(29, 37, 32))
      textSize = 20f
      setTypeface(typeface, Typeface.BOLD)
      setPadding(0, dp(context, 6), 0, 0)
    })
    val summary = TextView(context).apply {
      text = "₹${"%.2f".format(transaction.amount)} · $selectedCategory"
      setTextColor(brand)
      textSize = 16f
      setPadding(0, dp(context, 4), 0, dp(context, 12))
    }
    container.addView(summary)

    fun label(text: String) = TextView(context).apply {
      this.text = text
      setTextColor(Color.rgb(104, 114, 105))
      textSize = 11f
      setTypeface(typeface, Typeface.BOLD)
      setPadding(0, dp(context, 8), 0, dp(context, 6))
    }

    fun chipRow(
      values: List<String>,
      store: HashMap<String, TextView>,
      isSelected: (String) -> Boolean,
      onSelect: (String) -> Unit,
    ): View {
      val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
      values.forEach { value ->
        val chip = TextView(context).apply {
          text = value
          textSize = 13f
          setPadding(dp(context, 14), dp(context, 8), dp(context, 14), dp(context, 8))
          isClickable = true
          setOnClickListener { onSelect(value) }
        }
        styleChip(chip, isSelected(value))
        store[value] = chip
        val params = LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginEnd = dp(context, 8) }
        row.addView(chip, params)
      }
      return HorizontalScrollView(context).apply {
        isHorizontalScrollBarEnabled = false
        addView(row)
      }
    }

    val details = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      visibility = View.GONE
    }
    if (categories.isNotEmpty()) {
      details.addView(label("CATEGORY"))
      details.addView(
        chipRow(categories, categoryChips, { it == selectedCategory }) { value ->
          selectedCategory = value
          categoryChips.forEach { (key, chip) -> styleChip(chip, key == value) }
          summary.text = "₹${"%.2f".format(transaction.amount)} · $value"
        },
      )
    }
    if (people.isNotEmpty()) {
      details.addView(label("PEOPLE"))
      details.addView(
        chipRow(people, peopleChips, { it == selectedPerson }) { value ->
          selectedPerson = value
          peopleChips.forEach { (key, chip) -> styleChip(chip, key == value) }
        },
      )
    }
    container.addView(details)

    val actions = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, dp(context, 12), 0, 0)
    }
    val expand = Button(context).apply {
      text = if (details.childCount > 0) "Categorise ▾" else ""
      isAllCaps = false
      setTextColor(brand)
      setBackgroundColor(Color.TRANSPARENT)
      visibility = if (details.childCount > 0) View.VISIBLE else View.GONE
      setOnClickListener {
        val expanded = details.visibility == View.VISIBLE
        details.visibility = if (expanded) View.GONE else View.VISIBLE
        text = if (expanded) "Categorise ▾" else "Hide ▴"
      }
    }
    actions.addView(
      expand,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
    )
    actions.addView(Button(context).apply {
      text = "Edit"
      isAllCaps = false
      setOnClickListener {
        openApp(context, transaction.id)
        remove(context)
      }
    })
    actions.addView(Button(context).apply {
      text = "Save"
      isAllCaps = false
      setTextColor(Color.WHITE)
      background = rounded(brand, dp(context, 12).toFloat())
      setPadding(dp(context, 18), 0, dp(context, 18), 0)
      setOnClickListener {
        PendingTransactionStore.saveWithSelection(
          context,
          transaction.id,
          selectedCategory,
          selectedPerson,
        )
        remove(context)
      }
    })
    container.addView(actions)

    val params = WindowManager.LayoutParams(
      context.resources.displayMetrics.widthPixels - dp(context, 32),
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      y = dp(context, 42)
    }

    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).addView(container, params)
      overlay = container
      Log.i(TAG, "Overlay shown for ${transaction.id}")
    } catch (error: Exception) {
      Log.e(TAG, "Overlay failed, falling back to notification", error)
      showNotification(context, transaction)
    }
  }

  private fun styleChip(chip: TextView, selected: Boolean) {
    chip.setTextColor(if (selected) Color.WHITE else chipIdleText)
    chip.background = rounded(
      if (selected) brand else chipIdle,
      chip.resources.displayMetrics.density * 999,
    )
    chip.setTypeface(chip.typeface, if (selected) Typeface.BOLD else Typeface.NORMAL)
  }

  fun remove(context: Context) {
    overlay?.let { view ->
      try {
        (context.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
          .removeView(view)
      } catch (_: Exception) {
      }
    }
    overlay = null
  }

  private fun showNotification(context: Context, transaction: PaymentTransaction) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Payment prompts",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        enableVibration(true)
        setShowBadge(true)
      }
      manager.createNotificationChannel(channel)
    }

    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      putExtra("trackoTransactionId", transaction.id)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: return

    val contentIntent = PendingIntent.getActivity(
      context,
      transaction.id.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("₹${"%.2f".format(transaction.amount)} at ${transaction.merchant}")
      .setContentText("Suggested category: ${transaction.category}. Tap to categorise.")
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    manager.notify(transaction.id.hashCode(), notification)
    Log.i(TAG, "Notification shown for ${transaction.id}")
  }

  fun openOverlaySettings(context: Context) {
    context.startActivity(
      Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
  }

  private fun openApp(context: Context, transactionId: String) {
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      putExtra("trackoTransactionId", transactionId)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      context.startActivity(this)
    }
  }
}
