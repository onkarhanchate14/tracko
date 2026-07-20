package expo.modules.trackosms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

object PaymentOverlayManager {
  private const val CHANNEL_ID = "tracko_payment_prompts"
  private var overlay: LinearLayout? = null

  fun show(context: Context, transaction: PaymentTransaction) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(context)) showOverlay(context, transaction)
    else showNotification(context, transaction)
  }

  private fun showOverlay(context: Context, transaction: PaymentTransaction) {
    remove(context)
    val density = context.resources.displayMetrics.density
    fun px(value: Int) = (value * density).toInt()
    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(px(20), px(18), px(20), px(16))
      background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = px(24).toFloat() }
      elevation = px(12).toFloat()
    }
    container.addView(TextView(context).apply {
      text = "New payment"
      setTextColor(Color.rgb(90, 105, 94)); textSize = 12f
    })
    container.addView(TextView(context).apply {
      text = transaction.merchant
      setTextColor(Color.rgb(29, 37, 32)); textSize = 20f
      setPadding(0, px(7), 0, 0)
    })
    container.addView(TextView(context).apply {
      text = "₹${"%.2f".format(transaction.amount)} · ${transaction.category}"
      setTextColor(Color.rgb(29, 109, 64)); textSize = 16f
      setPadding(0, px(5), 0, px(14))
    })
    val actions = LinearLayout(context).apply { gravity = Gravity.END }
    val edit = Button(context).apply {
      text = "Edit"
      setOnClickListener { openApp(context, transaction.id); remove(context) }
    }
    val save = Button(context).apply {
      text = "Save"
      setOnClickListener { PendingTransactionStore.updateStatus(context, transaction.id, "overlay_saved"); remove(context) }
    }
    actions.addView(edit); actions.addView(save); container.addView(actions)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.TOP; y = px(42); x = px(16); width = context.resources.displayMetrics.widthPixels - px(32) }
    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).addView(container, params)
      overlay = container
    } catch (_: Exception) { showNotification(context, transaction) }
  }

  fun remove(context: Context) {
    overlay?.let { view ->
      try { (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view) } catch (_: Exception) { }
    }
    overlay = null
  }

  private fun showNotification(context: Context, transaction: PaymentTransaction) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Payment prompts", NotificationManager.IMPORTANCE_HIGH))
    }
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      putExtra("trackoTransactionId", transaction.id)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return
    val contentIntent = PendingIntent.getActivity(context, transaction.id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) android.app.Notification.Builder(context, CHANNEL_ID) else android.app.Notification.Builder(context)
    val notification = builder
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("₹${"%.2f".format(transaction.amount)} at ${transaction.merchant}")
      .setContentText("Suggested category: ${transaction.category}. Tap to categorise.")
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .build()
    manager.notify(transaction.id.hashCode(), notification)
  }

  fun openOverlaySettings(context: Context) {
    context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private fun openApp(context: Context, transactionId: String) {
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      putExtra("trackoTransactionId", transactionId)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      context.startActivity(this)
    }
  }
}
