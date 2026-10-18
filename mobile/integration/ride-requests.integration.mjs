import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  collection,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { saveMatchingFixture } from './matching-fixtures.mjs';
import { localDateAt, weekdayForDate, commuteKey } from '../src/mvp/settings.ts';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('Emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const {
  preparePair,
  commitAcceptance,
  requestIdFor,
  commitmentIdFor,
} = require('./lib/functions/src/rideRequests');
const { createOsrmRoutingAdapter } = require('./lib/mobile/src/routing/osrmAdapter');
const admin = adminApp({ projectId: 'demo-seawolf-rides' });
const db = adminFirestore(admin);
const clients = [];
const localDate = localDateAt(Date.now() / 1000 + 86400);
const weekday = weekdayForDate(localDate);
let server,
  providerFails = false;
async function client(uid, verified = true) {
  await adminAuth(admin).createUser({
    uid,
    email: `${uid}@stonybrook.edu`,
    password: 'Emulator-test-only-123!',
    emailVerified: verified,
  });
  const app = initializeApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const database = getFirestore(app);
  connectFirestoreEmulator(database, '127.0.0.1', 9095);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
  return { uid, auth, db: database, functions };
}
async function action(client, name, data) {
  for (let i = 0; i < 10; i++) {
    try {
      return (await httpsCallable(client.functions, name, { timeout: 120000 })(data)).data;
    } catch (error) {
      if (error.code !== 'functions/resource-exhausted' || i === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
}
async function pair(prefix, seats = 1) {
  const driver = await client(`${prefix}-driver`),
    rider = await client(`${prefix}-rider`);
  await saveMatchingFixture(driver, 'driver', weekday);
  await saveMatchingFixture(rider, 'rider', weekday, seats);
  const input = {
    driverId: driver.uid,
    localDate,
    direction: 'TO_CAMPUS',
    riderRevision: 'v1',
    driverRevision: 'v1',
  };
  const result = await action(rider, 'createRideRequest', input);
  return { driver, rider, input, id: result.id };
}
function watchStatus(client, id, status) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop();
      reject(new Error(`No ${status} update for ${client.uid}`));
    }, 10000);
    const stop = onSnapshot(
      query(
        collection(client.db, 'rideRequests'),
        where('participantIds', 'array-contains', client.uid),
      ),
      (snapshot) => {
        const value = snapshot.docs.find((d) => d.id === id)?.data();
        if (value?.status === status) {
          clearTimeout(timeout);
          stop();
          resolve(value);
        }
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
const respond = (client, requestId, decision) =>
  action(client, 'respondToRideRequest', { requestId, decision });
before(async () => {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (providerFails) {
      response.writeHead(503);
      response.end('{}');
      return;
    }
    const points = new URL(request.url, 'http://localhost').pathname
      .split('/')
      .pop()
      .split(';')
      .map((point) => point.split(',').map(Number));
    const durations = points.length === 2 ? [1800] : [600, 1500];
    response.end(
      JSON.stringify({
        code: 'Ok',
        waypoints: points.map((location) => ({ location, distance: 0, name: '' })),
        routes: [
          {
            distance: 10000,
            duration: durations.reduce((a, b) => a + b, 0),
            geometry: { type: 'LineString', coordinates: points },
            legs: durations.map((duration, index) => ({
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
  await Promise.all(clients.map(deleteApp));
  await deleteAdmin(admin);
  await new Promise((resolve) => server.close(resolve));
});

test('real recommendation → pending request → driver acceptance streams to both accounts and is idempotent', async () => {
  const driver = await client('aaa-requests-driver'),
    rider = await client('aaa-requests-rider');
  await saveMatchingFixture(driver, 'driver', weekday);
  await saveMatchingFixture(rider, 'rider', weekday);
  const matches = await action(rider, 'findCompatibleDrivers', {
    localDate,
    revision: 'v1',
    direction: 'TO_CAMPUS',
  });
  const selected = matches.recommendations.find((r) => r.driverId === driver.uid);
  assert.ok(selected);
  const input = {
    driverId: selected.driverId,
    localDate,
    direction: 'TO_CAMPUS',
    riderRevision: matches.riderRevision,
    driverRevision: selected.inputRevision,
  };
  const id = requestIdFor(rider.uid, driver.uid, localDate);
  const pendingUpdates = [watchStatus(rider, id, 'PENDING'), watchStatus(driver, id, 'PENDING')];
  assert.equal((await action(rider, 'createRideRequest', input)).status, 'PENDING');
  await Promise.all(pendingUpdates);
  assert.equal(
    (await db.doc(`_rideCommitments/${commitmentIdFor(driver.uid, localDate)}`).get()).exists,
    false,
  );
  assert.deepEqual(await action(rider, 'createRideRequest', input), { id, status: 'PENDING' });
  await assert.rejects(respond(rider, id, 'ACCEPTED'), { code: 'functions/permission-denied' });
  const acceptedUpdates = [watchStatus(rider, id, 'ACCEPTED'), watchStatus(driver, id, 'ACCEPTED')];
  assert.deepEqual(await respond(driver, id, 'ACCEPTED'), { id, status: 'ACCEPTED' });
  const values = await Promise.all(acceptedUpdates);
  assert.equal(values[0].plan.pickup, values[1].plan.pickup);
  assert.deepEqual(await respond(driver, id, 'ACCEPTED'), { id, status: 'ACCEPTED' });
  assert.deepEqual(await action(rider, 'createRideRequest', input), { id, status: 'ACCEPTED' });
  await assert.rejects(respond(driver, id, 'DECLINED'), { code: 'functions/failed-precondition' });
  for (const uid of [driver.uid, rider.uid]) {
    const commitment = (
      await db.doc(`_rideCommitments/${commitmentIdFor(uid, localDate)}`).get()
    ).data();
    assert.equal(commitment.requestId, id);
    assert.equal(commitment.reservedSeats, 1);
  }
});

test('only participants read requests, only the chosen driver decides, clients cannot forge reservations', async () => {
  const { driver, rider, input, id } = await pair('requests-decline');
  const stranger = await client('requests-stranger');
  await assert.rejects(getDoc(doc(stranger.db, 'rideRequests', id)), /permission/i);
  await assert.rejects(getDocs(collection(rider.db, 'rideRequests')), /permission/i);
  await assert.rejects(
    getDocs(
      query(
        collection(stranger.db, 'rideRequests'),
        where('participantIds', 'array-contains', rider.uid),
      ),
    ),
    /permission/i,
  );
  assert.ok(
    (
      await getDocs(
        query(
          collection(driver.db, 'rideRequests'),
          where('participantIds', 'array-contains', driver.uid),
        ),
      )
    ).docs.some((d) => d.id === id),
  );
  for (const participant of [driver, rider]) {
    await assert.rejects(
      setDoc(doc(participant.db, 'rideRequests', id), { status: 'ACCEPTED' }),
      /permission/i,
    );
    await assert.rejects(
      setDoc(doc(participant.db, '_rideCommitments', 'forged'), { requestId: id }),
      /permission/i,
    );
    await assert.rejects(
      getDoc(doc(participant.db, '_rideCommitments', commitmentIdFor(driver.uid, localDate))),
      /permission/i,
    );
  }
  await assert.rejects(respond(stranger, id, 'DECLINED'), { code: 'functions/permission-denied' });
  await assert.rejects(respond(driver, id, ['DECLINED']), { code: 'functions/invalid-argument' });
  assert.equal((await getDoc(doc(driver.db, 'rideRequests', id))).data().status, 'PENDING');
  await assert.rejects(action(rider, 'createRideRequest', { ...input, driverId: rider.uid }), {
    code: 'functions/invalid-argument',
  });
  await assert.rejects(action(rider, 'createRideRequest', { ...input, riderId: stranger.uid }), {
    code: 'functions/invalid-argument',
  });
  const updates = [watchStatus(driver, id, 'DECLINED'), watchStatus(rider, id, 'DECLINED')];
  assert.equal((await respond(driver, id, 'DECLINED')).status, 'DECLINED');
  await Promise.all(updates);
  assert.equal((await respond(driver, id, 'DECLINED')).status, 'DECLINED');
  assert.equal((await action(rider, 'createRideRequest', input)).status, 'DECLINED');
  await assert.rejects(respond(driver, id, 'ACCEPTED'), { code: 'functions/failed-precondition' });
  const unverified = await client('requests-unverified', false);
  await assert.rejects(action(unverified, 'createRideRequest', input), {
    code: 'functions/permission-denied',
  });
  await signOut(stranger.auth);
  await assert.rejects(action(stranger, 'createRideRequest', input), {
    code: 'functions/permission-denied',
  });
  await assert.rejects(respond(stranger, id, 'ACCEPTED'), { code: 'functions/permission-denied' });
});

test('acceptance revalidates opt-in, schedule revisions, seats, account eligibility and provider failures', async () => {
  for (const change of ['opt-out', 'schedule', 'seats', 'disabled', 'provider']) {
    const { driver, rider, id } = await pair(`requests-${change}`, change === 'seats' ? 2 : 1);
    if (change === 'disabled') await adminAuth(admin).updateUser(rider.uid, { disabled: true });
    else if (change === 'provider') {
      const cache = await db.collection('_m3RouteCache').get();
      await Promise.all(cache.docs.map((d) => d.ref.delete()));
      providerFails = true;
    } else if (change === 'seats') {
      const ref = db.doc(`users/${driver.uid}/commutes/primary`);
      await ref.update({ seats: 1 });
      const commute = (await ref.get()).data();
      await db
        .doc(`matchingSetups/${driver.uid}`)
        .update({ revision: 'v2', commuteKey: commuteKey(commute) });
    } else
      await db
        .doc(`matchingSetups/${driver.uid}`)
        .update(
          change === 'opt-out'
            ? { optIn: false, revision: 'v2' }
            : { startWindow: { earliest: 600, latest: 620 }, revision: 'v2' },
        );
    await assert.rejects(respond(driver, id, 'ACCEPTED'), {
      code: change === 'disabled' ? 'functions/permission-denied' : 'functions/failed-precondition',
    });
    assert.equal((await db.doc(`rideRequests/${id}`).get()).data().status, 'PENDING');
    assert.equal(
      (await db.doc(`_rideCommitments/${commitmentIdFor(driver.uid, localDate)}`).get()).exists,
      false,
    );
    // Decline can clean up a pending request even when matching/routing is unavailable.
    await respond(driver, id, 'DECLINED');
    providerFails = false;
  }
});

test('independent acceptance transactions cannot overbook one driver or double-book one rider', async () => {
  // Freeze independently validated preflights, then race the actual backend transaction helper.
  // This bypasses only the routing admission in this test, against a LOCAL FAKE router.
  const routing = createOsrmRoutingAdapter({ baseUrl: 'http://127.0.0.1:5009' });
  for (const shared of ['driver', 'rider']) {
    const first = await pair(`requests-race-${shared}-a`, 2);
    let second;
    if (shared === 'driver') {
      const rider = await client('requests-race-driver-b-rider');
      await saveMatchingFixture(rider, 'rider', weekday, 2);
      const input = { ...first.input };
      const request = await action(rider, 'createRideRequest', input);
      second = { driver: first.driver, rider, input, id: request.id };
    } else {
      const driver = await client('requests-race-rider-b-driver');
      await saveMatchingFixture(driver, 'driver', weekday);
      const input = { ...first.input, driverId: driver.uid };
      const request = await action(first.rider, 'createRideRequest', input);
      second = { driver, rider: first.rider, input, id: request.id };
    }
    const prepared = await Promise.all(
      [first, second].map((p) => preparePair(p.rider.uid, p.input, routing)),
    );
    const outcomes = await Promise.allSettled(
      [first, second].map((p, i) => commitAcceptance(p.id, p.driver.uid, prepared[i])),
    );
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
    const saved = await Promise.all(
      [first, second].map((p) => db.doc(`rideRequests/${p.id}`).get()),
    );
    assert.equal(saved.filter((r) => r.data().status === 'ACCEPTED').length, 1);
    const winner = saved.find((r) => r.data().status === 'ACCEPTED');
    const reservations = await db
      .collection('_rideCommitments')
      .where('requestId', '==', winner.id)
      .get();
    assert.equal(reservations.size, 2);
    reservations.forEach((r) => assert.equal(r.data().reservedSeats, 2));
  }
});

test('a saved input edit between routing and commit aborts acceptance without partial reservation', async () => {
  const value = await pair('requests-stale');
  const prepared = await preparePair(
    value.rider.uid,
    value.input,
    createOsrmRoutingAdapter({ baseUrl: 'http://127.0.0.1:5009' }),
  );
  await db.doc(`users/${value.driver.uid}/commutes/primary`).update({ seats: 1 });
  await assert.rejects(commitAcceptance(value.id, value.driver.uid, prepared), { code: 'aborted' });
  assert.equal((await db.doc(`rideRequests/${value.id}`).get()).data().status, 'PENDING');
  assert.equal(
    (await db.doc(`_rideCommitments/${commitmentIdFor(value.driver.uid, localDate)}`).get()).exists,
    false,
  );
});

test('concurrent duplicate creates and accepts are idempotent; a committed driver cannot switch roles to evade a conflict', async () => {
  const driver = await client('requests-duplicate-driver'),
    rider = await client('requests-duplicate-rider');
  await saveMatchingFixture(driver, 'driver', weekday);
  await saveMatchingFixture(rider, 'rider', weekday);
  const input = {
    driverId: driver.uid,
    localDate,
    direction: 'TO_CAMPUS',
    riderRevision: 'v1',
    driverRevision: 'v1',
  };
  await assert.rejects(action(rider, 'createRideRequest', { ...input, driverRevision: 'old' }), {
    code: 'functions/failed-precondition',
  });
  const created = await Promise.all([
    action(rider, 'createRideRequest', input),
    action(rider, 'createRideRequest', input),
  ]);
  assert.equal(created[0].id, created[1].id);
  const id = created[0].id;
  const routing = createOsrmRoutingAdapter({ baseUrl: 'http://127.0.0.1:5009' });
  const prepared = await preparePair(rider.uid, input, routing);
  const accepted = await Promise.all([
    commitAcceptance(id, driver.uid, prepared),
    commitAcceptance(id, driver.uid, prepared),
  ]);
  assert.ok(accepted.every((value) => value.status === 'ACCEPTED'));
  assert.equal(
    (await db.collection('_rideCommitments').where('requestId', '==', id).get()).size,
    2,
  );
  await saveMatchingFixture(driver, 'rider', weekday, 1, 'v2');
  const other = await client('requests-role-switch-driver');
  await saveMatchingFixture(other, 'driver', weekday);
  await assert.rejects(
    action(driver, 'createRideRequest', { ...input, driverId: other.uid, riderRevision: 'v2' }),
    {
      code: 'functions/failed-precondition',
    },
  );
});

test('simultaneous accept and decline resolve to one final decision', async () => {
  const { driver, id } = await pair('requests-decision-race');
  const outcomes = await Promise.allSettled([
    respond(driver, id, 'ACCEPTED'),
    respond(driver, id, 'DECLINED'),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  const state = (await db.doc(`rideRequests/${id}`).get()).data().status;
  assert.ok(['ACCEPTED', 'DECLINED'].includes(state));
  const reservations = await db.collection('_rideCommitments').where('requestId', '==', id).get();
  assert.equal(reservations.size, state === 'ACCEPTED' ? 2 : 0);
});

test('account eligibility is rechecked after routing finishes', async () => {
  const value = await pair('requests-auth-during-routing');
  const upstream = createOsrmRoutingAdapter({ baseUrl: 'http://127.0.0.1:5009' });
  let changed = false;
  const routing = {
    route: async (points) => {
      const result = await upstream.route(points);
      if (!changed) {
        changed = true;
        await adminAuth(admin).updateUser(value.rider.uid, { disabled: true });
      }
      return result;
    },
  };
  await assert.rejects(preparePair(value.rider.uid, value.input, routing), {
    code: 'permission-denied',
  });
  assert.equal((await db.doc(`rideRequests/${value.id}`).get()).data().status, 'PENDING');
});
