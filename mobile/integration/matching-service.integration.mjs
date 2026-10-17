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
import { commuteKey, localDateAt, weekdayForDate } from '../src/mvp/settings.ts';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('This test must run inside Firebase emulators.');
const projectId = 'demo-seawolf-rides';
const admin = initializeAdmin({ projectId });
const clients = [];
let server;
let providerFails = false;
let providerCalls = 0;
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
    { projectId, apiKey: 'emulator-only', authDomain: `${projectId}.firebaseapp.com` },
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
    call: httpsCallable(functions, 'findCompatibleDrivers', { timeout: 30000 }),
  };
}
async function saveSetup(client, mode) {
  const commute = {
    schemaVersion: 1,
    ownerId: client.uid,
    startArea: {
      center: { latitude: 40.9, longitude: -73.1 },
      radiusMiles: 2,
      label: 'Stony Brook area',
    },
    campusLot: 'westSide',
    days: [
      { day: weekday, mode: mode === 'driver' ? 'drive' : 'ride', arriveBy: 540, leaveAt: null },
    ],
    ...(mode === 'driver' ? { seats: 2 } : {}),
  };
  const setup = {
    schemaVersion: 1,
    ownerId: client.uid,
    revision: 'v1',
    commuteKey: commuteKey(commute),
    mode,
    active: true,
    optIn: true,
    campusLot: 'westSide',
    weekdays: [weekday],
    pointId: 'stony-brook-station',
    startWindow: { earliest: mode === 'driver' ? 460 : 480, latest: 510 },
    arrivalWindow: { earliest: 480, latest: 540 },
    seatsRequested: 1,
    maxDetourSeconds: 600,
    maxExtraRideSeconds: 900,
    accessWalkSeconds: 0,
    egressWalkSeconds: 0,
    maxAccessWalkSeconds: 300,
    maxEgressWalkSeconds: 300,
  };
  await setDoc(doc(client.db, 'users', client.uid), {
    schemaVersion: 1,
    firstName: client.uid,
    role: mode,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(client.db, 'users', client.uid, 'commutes', 'primary'), {
    ...commute,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(client.db, 'matchingSetups', client.uid), {
    ...setup,
    updatedAt: serverTimestamp(),
  });
  return setup;
}
before(async () => {
  server = createServer((request, response) => {
    providerCalls++;
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
        waypoints: points.map((point) => ({ location: point, distance: 0, name: '' })),
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
                  geometry: { type: 'LineString', coordinates: [points[index], points[index + 1]] },
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
  const request = { localDate: date, revision: riderSetup.revision, direction: 'TO_CAMPUS' };
  let result = (await rider.call(request)).data;
  assert.ok(result.recommendations.length > 0, JSON.stringify({ result, providerCalls }));
  assert.deepEqual(
    result.recommendations.map((item) => item.driverId),
    [driver.uid],
  );
  assert.equal(result.recommendations[0].metrics.driverExtraDurationSeconds, 420);
  assert.ok(providerCalls >= 2);
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
  await signOut(rider.auth);
  await assert.rejects(rider.call(request), /verified/i);
});
