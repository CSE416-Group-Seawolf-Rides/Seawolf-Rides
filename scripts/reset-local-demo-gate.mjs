import { createConnection } from 'node:net';
import { createRequire } from 'node:module';

if (process.argv.slice(2).join(' ') !== '--workers-stopped')
  throw new Error(
    'First stop ALL old Functions workers. See docs/local-m3-demo.md. Then pass --workers-stopped.',
  );
const listening = await new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port: 5001 });
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', (error) => resolve(error.code !== 'ECONNREFUSED'));
  socket.setTimeout(1000, () => {
    socket.destroy();
    resolve(true);
  });
});
if (listening)
  throw new Error('Functions port 5001 is still listening. Refusing to clear ownership.');
// Fixed loopback, emulator project and document. Admin SDK bypasses client rules locally.
// No credentials or cloud URL accepted; initialization cannot fall back to cloud Firestore.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9095';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-seawolf-rides' });
try {
  await getFirestore(app).doc('_m3Routing/publicOsrm').delete();
} finally {
  await deleteApp(app);
}
await new Promise((resolve) => setTimeout(resolve, 1200));
console.log(
  'Only the local demo scheduler gate was removed. Stop/export Firestore before restarting the complete backend.',
);
