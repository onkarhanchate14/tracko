const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const RECEIVER_CLASS = "expo.modules.trackosms.PaymentSmsReceiver";

function receiverAlreadyPresent(app) {
  return (app.receiver ?? []).some((entry) => {
    const name = entry.$?.["android:name"];
    return name === RECEIVER_CLASS || name?.endsWith(".PaymentSmsReceiver");
  });
}

function withTrackoSmsAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!receiverAlreadyPresent(app)) {
      app.receiver = [
        ...(app.receiver ?? []),
        {
          $: {
            "android:name": RECEIVER_CLASS,
            "android:exported": "true",
            "android:enabled": "true",
            "android:permission": "android.permission.BROADCAST_SMS",
          },
          "intent-filter": [
            {
              $: { "android:priority": "999" },
              action: [
                {
                  $: {
                    "android:name": "android.provider.Telephony.SMS_RECEIVED",
                  },
                },
              ],
            },
          ],
        },
      ];
    }

    return config;
  });
}

module.exports = function withTrackoSms(config) {
  config = withTrackoSmsAndroid(config);
  return config;
};
