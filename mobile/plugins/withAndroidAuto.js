// Expo config plugin: Android Auto (androidx.car.app) support for Seawolf Rides.
//
// @g4rb4g3/react-native-carplay already ships the CarAppService declaration
// (NAVIGATION category, foregroundServiceType="location") in its own library
// manifest, which Gradle merges in. This plugin adds the app-level pieces the
// library does not provide:
//   - car + location + foreground-service permissions
//   - the automotive_app_desc.xml resource and the com.google.android.gms.car.application
//     meta-data that tells Android Auto this app uses car templates
//
// Android Automotive OS (AAOS) runs the app on the car's own head unit instead
// of projecting from a phone, so it additionally needs:
//   - androidx.car.app:app-automotive (provides CarAppActivity, the host-side
//     activity that renders the CarAppService's templates)
//   - a CarAppActivity entry with the distractionOptimized meta-data
//   - the com.android.automotive meta-data pointing at automotive_app_desc
//   - non-required automotive uses-feature entries, so phones still install it
// CarAppActivity is gated by a boolean resource (false by default, so a phone gets
// no extra launcher icon). The `-car` qualifier does NOT reliably match on AAOS
// images (they do not report UI_MODE_TYPE_CAR), so MainApplication also enables the
// component at runtime when FEATURE_AUTOMOTIVE is present.
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');

// Must match the androidx.car.app:app version the library pulls in.
const CAR_APP_VERSION = '1.7.0';
const AUTOMOTIVE_DEPENDENCY = `implementation "androidx.car.app:app-automotive:${CAR_APP_VERSION}"`;

const PERMISSIONS = [
  'androidx.car.app.NAVIGATION_TEMPLATES',
  'androidx.car.app.ACCESS_SURFACE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.WAKE_LOCK',
];

const CAR_FLAGS = (enabled) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <bool name="car_app_activity_enabled">${enabled}</bool>
</resources>
`;

const AUTOMOTIVE_DESC = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
  <uses name="template" />
</automotiveApp>
`;

function withCarManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    for (const name of PERMISSIONS) {
      if (!manifest['uses-permission'].some((p) => p.$['android:name'] === name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    // app-automotive declares minSdk 29 but the phone app supports 24. The library is
    // only exercised on AAOS (API 29+), so let the manifest merger accept it.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    manifest['uses-sdk'] = manifest['uses-sdk'] ?? [{ $: {} }];
    manifest['uses-sdk'][0].$['tools:overrideLibrary'] = 'androidx.car.app.automotive';

    // Never required: a required automotive feature would hide the app from phones.
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    for (const name of ['android.hardware.type.automotive', 'android.software.car.templates_host']) {
      if (!manifest['uses-feature'].some((f) => f.$['android:name'] === name)) {
        manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    for (const name of ['com.google.android.gms.car.application', 'com.android.automotive']) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, '@xml/automotive_app_desc', 'resource');
    }

    app.activity = app.activity ?? [];
    const activityName = 'androidx.car.app.activity.CarAppActivity';
    if (!app.activity.some((a) => a.$['android:name'] === activityName)) {
      app.activity.push({
        $: {
          'android:name': activityName,
          'android:exported': 'true',
          'android:enabled': '@bool/car_app_activity_enabled',
          'android:launchMode': 'singleTask',
          'android:theme': '@android:style/Theme.DeviceDefault.NoActionBar',
          'android:label': '@string/app_name',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        }],
        'meta-data': [{ $: { 'android:name': 'distractionOptimized', 'android:value': 'true' } }],
      });
    }
    return mod;
  });
}

function withAutomotiveDesc(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'automotive_app_desc.xml'), AUTOMOTIVE_DESC);

      // Disabled everywhere except under the car UI-mode qualifier (AAOS).
      const resRoot = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [dir, enabled] of [['values', false], ['values-car', true]]) {
        fs.mkdirSync(path.join(resRoot, dir), { recursive: true });
        fs.writeFileSync(path.join(resRoot, dir, 'car_app_activity.xml'), CAR_FLAGS(enabled));
      }
      return mod;
    },
  ]);
}

function withAutomotiveDependency(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('androidx.car.app:app-automotive')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        (match) => `${match}
    ${AUTOMOTIVE_DEPENDENCY}`,
      );
    }
    return mod;
  });
}

const ENABLE_MARKER = 'enableCarAppActivityOnAutomotive';
const ENABLE_CALL = `    ${ENABLE_MARKER}()`;
const ENABLE_FUN = `
  private fun ${ENABLE_MARKER}() {
    if (!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_AUTOMOTIVE)) return
    packageManager.setComponentEnabledSetting(
      android.content.ComponentName(this, "androidx.car.app.activity.CarAppActivity"),
      android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
      android.content.pm.PackageManager.DONT_KILL_APP
    )
  }
`;

function withCarActivityEnabler(config) {
  return withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes(ENABLE_MARKER)) {
      const nl = src.includes('\r\n') ? '\r\n' : '\n';
      src = src.replace('super.onCreate()', `super.onCreate()${nl}${ENABLE_CALL}`);
      src = src.replace(
        '  override fun onConfigurationChanged',
        `${ENABLE_FUN.trimStart()}${nl}  override fun onConfigurationChanged`,
      );
      mod.modResults.contents = src;
    }
    return mod;
  });
}

module.exports = function withAndroidAuto(config) {
  return withCarActivityEnabler(withAutomotiveDependency(withAutomotiveDesc(withCarManifest(config))));
};
