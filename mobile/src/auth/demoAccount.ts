// Local-emulator demo account created by scripts/seed-demo-data.mjs. These credentials only
// exist in the `demo-seawolf-rides` emulator; there is no such account in a real project.
export const DEMO_ACCOUNT = {
  email: 'demo@stonybrook.edu',
  password: 'seawolf-demo-2026',
} as const;

// "Explore as a guest" signs in to the seeded account when the app talks to the emulator.
export const canUseSeededDemo = () =>
  __DEV__ && Boolean(process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST);
