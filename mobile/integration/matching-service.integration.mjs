import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { localDateAt, weekdayForDate } from '../src/mvp/settings.ts';
import { saveMatchingFixture } from './matching-fixtures.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
const { firestoreDemoRouting } = require('./lib/functions/src/firestoreDemoRouting');
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('This test must run inside Firebase emulators.');
const projectId = 'demo-seawolf-rides';
const admin = initializeAdmin({ projectId });
const clients = [];
let server;
let providerFails = false;
let providerCalls = 0;
let providerPause = Promise.resolve();
const providerTimes = [];
// Every participant and setup is persisted through real SDK calls. Only road estimates are mocked.
const future = Date.now() / 1000 + 86400;
const date = localDateAt(future);
const weekday = weekdayForDate(date);
async function client(uid, verified = true) {
  const authAdmin = getAdminAuth(admin);
  await authAdmin.createUser({
    uid,
    email: `${uid}@stonybrook.edu`,
    emailVerified: verified,
    password: 'Emulator-test-only-123!',
  });
  const app = initializeApp(
    {
      projectId,
      apiKey: 'emulator-only',
      authDomain: `${projectId}.firebaseapp.com`,
    },
    uid,
  );
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
  return {
    uid,
    db,
    auth,
    rawCall: httpsCallable(functions, 'findCompatibleDrivers', {
      timeout: 120000,
    }),
    call: async (input) => {
      const invoke = httpsCallable(functions, 'findCompatibleDrivers', {
        timeout: 120000,
      });
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await invoke(input);
        } catch (error) {
          if (error.code !== 'functions/resource-exhausted' || attempt === 4) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    },
  };
}
const saveSetup = (client, mode) => saveMatchingFixture(client, mode, weekday);
before(async () => {
  server = createServer(async (request, response) => {
    assert.match(request.headers['user-agent'] ?? '', /SeawolfRides-M3-Demo/);
    providerCalls++;
    providerTimes.push(Date.now());
    await providerPause;
    response.setHeader('Content-Type', 'application/json');
    if (providerFails) {
      response.statusCode = 503;
      response.end('{}');
      return;
    }
    const segment = new URL(request.url, 'http://localhost').pathname.split('/').pop();
    const points = segment.split(';').map((point) => point.split(',').map(Number));
    const seconds = points.length === 2 ? [1800] : [600, 1500];
    response.end(
      JSON.stringify({
        code: 'Ok',
        waypoints: points.map((point) => ({
          location: point,
          distance: 0,
          name: '',
        })),
        routes: [
          {
            distance: 10000,
            duration: seconds.reduce((a, b) => a + b, 0),
            geometry: { type: 'LineString', coordinates: points },
            legs: seconds.map((duration, index) => ({
              duration,
              distance: 5000,
              summary: '',
              steps: [
                {
                  duration,
                  distance: 5000,
                  name: 'Public road',
                  geometry: {
                    type: 'LineString',
                    coordinates: [points[index], points[index + 1]],
                  },
                  maneuver: { type: 'depart', location: points[index] },
                },
              ],
            })),
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(5009, '127.0.0.1', resolve));
});
after(async () => {
  await Promise.all(clients.map((app) => deleteApp(app)));
  await deleteAdmin(admin);
  if (server) await new Promise((resolve) => server.close(resolve));
});
test('two authenticated accounts persist setup, discover real drivers, react to edits, and reject private reads', async () => {
  const driver = await client('mvp-driver');
  const rider = await client('mvp-rider');
  const driverSetup = await saveSetup(driver, 'driver');
  const riderSetup = await saveSetup(rider, 'rider');
  const stored = (await getDoc(doc(rider.db, 'matchingSetups', rider.uid))).data();
  assert.equal(stored.revision, riderSetup.revision);
  const request = {
    localDate: date,
    revision: riderSetup.revision,
    direction: 'TO_CAMPUS',
  };
  let unblockProvider;
  // Keep the first uncached request in flight so worker startup cannot erase the overlap.
  providerPause = new Promise((resolve) => {
    unblockProvider = resolve;
  });
  const pending = rider.call(request);
  // A second authenticated account uses a separate SDK client while the first search routes.
  for (let attempt = 0; attempt < 500 && providerCalls === 0; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(providerCalls > 0, 'first search reached the fake provider');
  try {
    await Promise.all([
      assert.rejects(driver.rawCall(request), {
        code: 'functions/resource-exhausted',
      }),
      assert.rejects(rider.rawCall({ action: 'PREVIEW', revision: 'v1' }), {
        code: 'functions/resource-exhausted',
      }),
    ]);
  } finally {
    unblockProvider();
  }
  let result = (await pending).data;
  assert.ok(result.recommendations.length > 0, JSON.stringify({ result, providerCalls }));
  assert.deepEqual(
    result.recommendations.map((item) => item.driverId),
    [driver.uid],
  );
  assert.equal(result.recommendations[0].metrics.driverExtraDurationSeconds, 420);
  assert.ok(providerCalls >= 2);
  assert.equal(result.candidateLimit, 2);
  const cachedCalls = providerCalls;
  // Cached operations may complete before another invocation starts; do not assume overlap.
  await rider.call(request);
  await rider.call({ action: 'PREVIEW', revision: 'v1' });
  assert.equal(providerCalls, cachedCalls, 'cached search/preview do not fetch the provider again');
  await assert.rejects(
    rider.call({ action: 'PREVIEW', revision: 'v1', coordinates: [] }),
    /Supply/,
  );
  assert.equal(
    (await getAdminFirestore(admin).doc('_m3Routing/publicOsrm').get()).data().owner,
    null,
  );

  assert.doesNotMatch(JSON.stringify(result), /coordinate|commuteKey|driverStart|routingEstimates/);
  await assert.rejects(getDoc(doc(rider.db, 'matchingSetups', driver.uid)), /permission/i);
  await assert.rejects(
    getDoc(doc(rider.db, 'users', driver.uid, 'commutes', 'primary')),
    /permission/i,
  );
  await setDoc(doc(driver.db, 'matchingSetups', driver.uid), {
    ...driverSetup,
    revision: 'v2',
    maxDetourSeconds: 60,
    updatedAt: serverTimestamp(),
  });
  result = (await rider.call(request)).data;
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.incompatibleCount, 1);
  await setDoc(doc(driver.db, 'matchingSetups', driver.uid), {
    ...driverSetup,
    revision: 'v3',
    updatedAt: serverTimestamp(),
  });
  // Invalidate persisted cache only in this emulator test to exercise provider outage.
  const adminDb = getAdminFirestore(admin);
  const cache = await adminDb.collection('_m3RouteCache').get();
  await Promise.all(cache.docs.map((d) => d.ref.delete()));
  providerFails = true;
  result = (await rider.call(request)).data;
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.incompatibleCount, 0);
  providerFails = false;
  await setDoc(doc(driver.db, 'matchingSetups', driver.uid), {
    ...driverSetup,
    revision: 'v4',
    optIn: false,
    updatedAt: serverTimestamp(),
  });
  result = (await rider.call(request)).data;
  assert.equal(result.recommendations.length, 0);
  await assert.rejects(rider.call({ ...request, riderId: driver.uid }), /date|direction|Supply/i);
  await assert.rejects(rider.call({ ...request, revision: 'old' }), /changed/i);
  const unverified = await client('mvp-unverified', false);
  await assert.rejects(unverified.call(request), /verified/i);
  await signOut(rider.auth);
  await signInWithEmailAndPassword(
    rider.auth,
    `${rider.uid}@stonybrook.edu`,
    'Emulator-test-only-123!',
  );
  assert.equal((await getDoc(doc(rider.db, 'matchingSetups', rider.uid))).data().revision, 'v1');
  const preview = (await rider.call({ action: 'PREVIEW', revision: 'v1' })).data;
  assert.equal(preview.status, 'SUCCESS');
  // Three eligible persisted drivers prove the public-demo cap reports an incomplete search.
  for (const name of ['mvp-extra-a', 'mvp-extra-b', 'mvp-extra-c'])
    await saveSetup(await client(name), 'driver');
  result = (await rider.call(request)).data;
  assert.equal(result.candidateLimitReached, true);
  assert.equal(result.candidateLimit, 2);
  assert.equal(result.recommendations.length, 2);
  for (let i = 1; i < providerTimes.length; i++)
    assert.ok(providerTimes[i] - providerTimes[i - 1] >= 1000);
  await assert.rejects(getDoc(doc(rider.db, '_m3Routing', 'publicOsrm')), /permission/i);
  const cacheDoc = (await getAdminFirestore(admin).collection('_m3RouteCache').limit(1).get())
    .docs[0];
  await assert.rejects(getDoc(doc(rider.db, '_m3RouteCache', cacheDoc.id)), /permission/i);
  await signOut(rider.auth);
  await assert.rejects(rider.call(request), /verified/i);
});

test('Firestore admission is atomic across instances and never expires a crashed owner automatically', async () => {
  const db = getAdminFirestore(admin);
  const endpoint = 'http://127.0.0.1:5009';
  const gate = db.doc('_m3Routing/publicOsrm');
  await gate.delete();
  const a = firestoreDemoRouting(db, endpoint);
  const b = firestoreDemoRouting(db, endpoint);
  const results = await Promise.all([a.acquire('a'), b.acquire('b')]);
  assert.equal(results.filter(Boolean).length, 1);
  const owner = results[0] ? 'a' : 'b';
  await gate.update({ acquiredAtMs: 0 });
  assert.equal(await b.acquire('late'), false);
  await a.release('wrong-owner');
  assert.equal((await gate.get()).data().owner, owner);
  await a.release(owner);
  assert.equal(await b.acquire('next'), false);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(await b.acquire('next'), true);
  await b.release('next');
});
