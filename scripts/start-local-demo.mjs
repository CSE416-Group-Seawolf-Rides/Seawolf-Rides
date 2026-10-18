import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit opt-in: ordinary automated tests must never contact the public router.
if (process.argv.slice(2).join(' ') !== '--live-osrm')
  throw new Error('Usage: node scripts/start-local-demo.mjs --live-osrm');
const root = fileURLToPath(new URL('../', import.meta.url));
const file = new URL('../functions/.env.local', import.meta.url);
await writeFile(file, 'OSRM_BASE_URL=https://router.project-osrm.org\n', {
  flag: 'wx',
  mode: 0o600,
});
try {
  const data = fileURLToPath(new URL('../.local-demo-data', import.meta.url));
  const hasExport = existsSync(`${data}/firebase-export-metadata.json`);
  if (existsSync(data) && readdirSync(data).length > 0 && !hasExport)
    throw new Error('Local demo data exists without an export manifest. Preserve/repair it before starting.');
  // Emulators execute compiled JavaScript. Always compile before discovering endpoints;
  // a running emulator can retain old exports, particularly in hidden worktree paths.
  const build = spawnSync('npm', ['run', 'build', '--prefix', 'functions'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error('Functions build failed. The demo backend was not started.');
  const args = [
    '--yes',
    'firebase-tools@15.33.0',
    'emulators:start',
    '--config',
    'firebase.demo.json',
    '--project',
    'demo-seawolf-rides',
    '--only',
    'auth,firestore,functions',
    `--export-on-exit=${data}`,
  ];
  if (hasExport) args.push(`--import=${data}`);
  const child = spawn('npx', args, {
    cwd: root,
    stdio: 'inherit',
    detached: true,
  });
  let stopping = false;
  const stop = (signal) => {
    if (!stopping) {
      stopping = true;
      process.kill(-child.pid, signal);
    }
  };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status) => resolve(status ?? 1));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
} finally {
  await unlink(file);
}
