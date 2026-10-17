import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

const host = process.argv[2];
if (process.argv.length !== 3 || isIP(host ?? '') !== 4 || host === '0.0.0.0')
  throw new Error(
    'Supply the Mac LAN IPv4 address (no port): node scripts/start-local-demo.mjs 192.168.1.10',
  );
// Override cloud .env values in this process only. Both clients get the same bundled host.
const child = spawn('npx', ['expo', 'start', '--lan', '--clear'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'emulator-only',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-seawolf-rides.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-seawolf-rides',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-seawolf-rides.appspot.com',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:local-demo',
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: host,
    EXPO_PUBLIC_OSRM_BASE_URL: '',
  },
});
child.once('error', (error) => {
  throw error;
});
child.once('exit', (status) => {
  process.exitCode = status ?? 1;
});
