import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const file = new URL('../../functions/.env.local', import.meta.url);
// Never overwrite a developer's local configuration or accidentally call a live router.
await writeFile(file, 'OSRM_BASE_URL=http://127.0.0.1:5009\nROUTING_PROVIDER=osrm\n', {
  flag: 'wx',
  mode: 0o600,
});
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
    'node --import ./scripts/node-test/register-ts-resolver.mjs --test --test-concurrency=1 integration/matching-service.integration.mjs integration/ride-requests.integration.mjs integration/commute-calendar.integration.mjs integration/payments.integration.mjs integration/ride-cancellation.integration.mjs integration/chat-timeline.integration.mjs integration/profile-workflows.integration.mjs',
    [`--export-on-exit=${exported}`],
  );
  if (process.exitCode === 0)
    process.exitCode = await run(
      'auth,firestore',
      'node integration/verify-matching-import.mjs',
      [`--import=${exported}`],
    );
  if (process.exitCode === 0) {
    // Owned test configuration only: initial exclusive creation above protects local settings.
    await writeFile(
      file,
      'OSRM_BASE_URL=http://127.0.0.1:5009\nROUTING_PROVIDER=tomtom\nTOMTOM_API_KEY=fake_backend_only_key\nTOMTOM_BASE_URL=http://127.0.0.1:5009\n',
    );
    process.exitCode = await run(
      'auth,firestore,functions',
      'node --import ./scripts/node-test/register-ts-resolver.mjs --test integration/traffic-routing.integration.mjs',
      [`--export-on-exit=${join(exported, 'traffic')}`],
    );
    if (process.exitCode === 0)
      process.exitCode = await run(
        'auth,firestore',
        'node integration/verify-traffic-import.mjs',
        [`--import=${join(exported, 'traffic')}`],
      );
  }
} finally {
  await unlink(file);
  await rm(exported, { recursive: true, force: true });
}
