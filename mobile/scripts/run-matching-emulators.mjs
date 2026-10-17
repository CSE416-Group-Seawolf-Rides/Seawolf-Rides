import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
const file = new URL('../../functions/.env.local', import.meta.url);
// Never overwrite a developer's local configuration or accidentally call a live router.
await writeFile(file, 'OSRM_BASE_URL=http://127.0.0.1:5009\n', { flag: 'wx' });
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        '--yes',
        'firebase-tools@15.33.0',
        'emulators:exec',
        '--config',
        '../firebase.json',
        '--only',
        'auth,firestore,functions',
        '--project',
        'demo-seawolf-rides',
        'node --import ./scripts/node-test/register-ts-resolver.mjs --test integration/matching-service.integration.mjs',
      ],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  await unlink(file);
}
