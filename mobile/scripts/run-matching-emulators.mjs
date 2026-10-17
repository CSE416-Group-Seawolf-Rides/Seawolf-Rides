import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const file = new URL('../../functions/.env.local', import.meta.url);
// Never overwrite a developer's local configuration or accidentally call a live router.
await writeFile(file, 'OSRM_BASE_URL=http://127.0.0.1:5009\n', { flag: 'wx' });
const exported = await mkdtemp(join(tmpdir(), 'seawolf-emulator-export-'));
const run = (only, command, dataArgs) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        '--yes',
        'firebase-tools@15.33.0',
        'emulators:exec',
        '--config',
        '../firebase.json',
        '--only',
        only,
        '--project',
        'demo-seawolf-rides',
        ...dataArgs,
        command,
      ],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (status) => resolve(status ?? 1));
  });
try {
  process.exitCode = await run(
    'auth,firestore,functions',
    'node --import ./scripts/node-test/register-ts-resolver.mjs --test integration/matching-service.integration.mjs',
    [`--export-on-exit=${exported}`],
  );
  if (process.exitCode === 0)
    process.exitCode = await run('auth,firestore', 'node integration/verify-matching-import.mjs', [
      `--import=${exported}`,
    ]);
} finally {
  await unlink(file);
  await rm(exported, { recursive: true, force: true });
}
