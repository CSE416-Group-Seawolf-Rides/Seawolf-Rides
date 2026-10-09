const androidApiKey = process.env.GOOGLE_NAVIGATION_ANDROID_API_KEY ?? '';
const iosApiKey = process.env.GOOGLE_NAVIGATION_IOS_API_KEY ?? '';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    './plugins/withGoogleNavigation',
  ],
  extra: {
    ...config.extra,
    googleNavigation: {
      androidConfigured: androidApiKey.length > 0,
      iosConfigured: iosApiKey.length > 0,
    },
  },
});
