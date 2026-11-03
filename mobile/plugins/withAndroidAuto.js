// Expo config plugin: Android Auto (androidx.car.app) support for Seawolf Rides.
//
// @g4rb4g3/react-native-carplay already ships the CarAppService declaration
// (NAVIGATION category, foregroundServiceType="location") in its own library
// manifest, which Gradle merges in. This plugin adds the app-level pieces the
// library does not provide:
//   - car + location + foreground-service permissions
//   - the automotive_app_desc.xml resource and the com.google.android.gms.car.application
//     meta-data that tells Android Auto this app uses car templates
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

const PERMISSIONS = [
  'androidx.car.app.NAVIGATION_TEMPLATES',
  'androidx.car.app.ACCESS_SURFACE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.WAKE_LOCK',
];

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

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      'com.google.android.gms.car.application',
      '@xml/automotive_app_desc',
      'resource',
    );
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
      return mod;
    },
  ]);
}

module.exports = function withAndroidAuto(config) {
  return withAutomotiveDesc(withCarManifest(config));
};
