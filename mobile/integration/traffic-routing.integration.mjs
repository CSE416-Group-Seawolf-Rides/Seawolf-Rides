import assert from 'node:assert/strict';
import { verifySymmetricRequests } from './symmetric-request-checks.mjs';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import {
  localDateAt,
  localMinuteToEpoch,
  weekdayForDate,
} from '../src/mvp/settings.ts';
import { toPrivacyArea } from '../src/commute/commuteModel.ts';
import { nextForecastDate } from '../src/commute/commuteForecast.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { vehicleFixture } from './matching-fixtures.mjs';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Loopback test emulators required.');
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
);
const {
  initializeApp: initializeAdmin,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = initializeAdmin(
  { projectId: 'demo-seawolf-rides' },
  'traffic-test',
);
const db = adminFirestore(admin),
  clients = [],
  calls = [];
const start = { latitude: 40.92047, longitude: -73.12844 },
  pickup = { latitude: 40.92147, longitude: -73.12844 };
let providerFails = false;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const points = url.pathname
    .split('/')
    .at(-2)
    .split(':')
    .map((p) => {
      const [latitude, longitude] = p.split(',').map(Number);
      return { latitude, longitude };
    });
  const arrival = url.searchParams.has('arriveAt')
    ? Date.parse(url.searchParams.get('arriveAt')) / 1000
    : undefined;
  let departure = Date.parse(url.searchParams.get('departAt')) / 1000;
  res.setHeader('Content-Type', 'application/json');
  if (providerFails) {
    calls.push({ points, departure, arrival });
    res.writeHead(503);
    res.end('{}');
    return;
  }
  assert.equal(url.searchParams.get('traffic'), 'true');
  const duration =
    arrival !== undefined
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(arrival * 1000) === '09'
        ? 2700
        : 1500
      : points[0].latitude === pickup.latitude
        ? 1500
        : points[1].latitude === pickup.latitude
          ? 600
          : 1800;
  if (arrival !== undefined) {
    assert.equal(url.searchParams.has('departAt'), false);
    departure = arrival - duration;
  }
  calls.push({ points, departure, arrival });
  const summary = {
    lengthInMeters: 5000,
    travelTimeInSeconds: duration,
    historicTrafficTravelTimeInSeconds: duration,
    departureTime: new Date(departure * 1000).toISOString(),
    arrivalTime: new Date((departure + duration) * 1000).toISOString(),
  };
  res.end(
    JSON.stringify({ routes: [{ summary, legs: [{ summary, points }] }] }),
  );
});
async function client(uid, role, point, date) {
  await adminAuth(admin).createUser({
    uid,
    email: `${uid}@stonybrook.edu`,
    emailVerified: true,
    password: 'Emulator-test-only-123!',
  });
  const app = initializeApp(
    { projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' },
    uid,
  );
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const database = getFirestore(app);
  connectFirestoreEmulator(database, '127.0.0.1', 9095);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(
    auth,
    `${uid}@stonybrook.edu`,
    'Emulator-test-only-123!',
  );
  await setDoc(doc(database, 'users', uid), {
    schemaVersion: 1,
    firstName: uid,
    role,
    updatedAt: new Date(),
  });
  await setDoc(doc(database, 'users', uid, 'commutes', 'primary'), {
    schemaVersion: 1,
    ownerId: uid,
    startPoint: point,
    startArea: toPrivacyArea(point, 'Area'),
    campusLot: 'westSide',
    discoveryEnabled: true,
    ...(role === 'driver' ? { seats: 1 } : {}),
    days: [
      {
        day: weekdayForDate(date),
        mode: role === 'driver' ? 'drive' : 'ride',
        startAt: 480,
        arriveBy: 540,
        leaveAt: 1020,
      },
    ],
    updatedAt: new Date(),
  });
  return { uid, db: database, functions };
}
async function action(client, name, data) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return (
        await httpsCallable(client.functions, name, { timeout: 120000 })(data)
      ).data;
    } catch (e) {
      if (e.code !== 'functions/resource-exhausted' || attempt === 9) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}
test(
  'traffic forecasts through real callable accounts: dated legs, one-candidate pages, shared cache, acceptance, privacy, failures and quota',
  { timeout: 240000 },
  async (t) => {
    await new Promise((resolve) => server.listen(5009, '127.0.0.1', resolve));
    try {
      const date = localDateAt(Date.now() / 1000 + 86400);
      const driver = await client('traffic-a-driver', 'driver', start, date),
        driver2 = await client('traffic-b-driver', 'driver', start, date),
        rider = await client('traffic-rider', 'rider', pickup, date),
        outsider = await client('traffic-outsider', 'rider', pickup, date);
      await db
        .doc(`users/${outsider.uid}/commutes/primary`)
        .update({ discoveryEnabled: false });
      const first = await action(rider, 'findCommuteMatches', {
        localDate: date,
      });
      assert.equal(first.totalCandidatePlans, 2);
      assert.equal(first.checkedCandidatePlans, 1);
      assert.ok(first.nextCursor);
      assert.equal(first.incomplete, true);
      const match = first.matches[0],
        departure = localMinuteToEpoch(date, 480);
      assert.equal(match.driverId, driver.uid);
      assert.equal(match.eta.model, 'TRAFFIC_FORECAST');
      assert.equal(match.eta.provider, 'TomTom');
      assert.deepEqual(
        calls.map((c) => c.departure),
        [departure, departure, departure + 720],
      );
      assert.equal(match.plan.vehicleCampusArrival, departure + 2220);
      assert.equal(match.plan.pickup, departure + 600);
      assert.equal(
        JSON.stringify(first).includes('fake_backend_only_key'),
        false,
      );
      assert.equal(match.startPoint, undefined);
      assert.equal(match.riderPickup, undefined);
      const second = await action(rider, 'findCommuteMatches', {
        localDate: date,
        cursor: first.nextCursor,
      });
      assert.equal(second.matches[0].driverId, driver2.uid);
      assert.equal(second.nextCursor, null);
      assert.equal(
        calls.length,
        3,
        'same departure and points reuse cache across candidates',
      );
      const ownDriver = await action(driver, 'findCommuteMatches', {
        localDate: date,
      });
      assert.equal(ownDriver.matches[0].riderId, rider.uid);
      assert.equal(
        calls.length,
        3,
        'driver and rider views use one cached road model',
      );
      await action(driver, 'saveVehicleDetails', vehicleFixture(driver.uid));
      const pending = await action(rider, 'createRideRequest', {
        source: 'CALENDAR',
        direction: 'TO_CAMPUS',
        localDate: date,
        driverId: driver.uid,
        riderRevision: match.riderRevision,
        driverRevision: match.driverRevision,
        proposedPlan: {
          departure: match.plan.departure,
          pickup: match.plan.pickup,
          vehicleCampusArrival: match.plan.vehicleCampusArrival,
        },
      });
      await assert.rejects(
        getDoc(doc(outsider.db, 'rideRequests', pending.id)),
        {
          code: 'permission-denied',
        },
      );
      await action(driver, 'respondToRideRequest', {
        requestId: pending.id,
        decision: 'ACCEPTED',
      });
      for (const account of [driver, rider]) {
        const accepted = (
          await getDoc(doc(account.db, 'rideRequests', pending.id))
        ).data();
        assert.equal(accepted.status, 'ACCEPTED');
        assert.equal(
          accepted.plan.vehicleCampusArrival,
          match.plan.vehicleCampusArrival,
        );
      }
      await assert.rejects(
        getDoc(doc(outsider.db, 'ridePickups', pending.id)),
        {
          code: 'permission-denied',
        },
      );
      const next = shiftDate(date, 7);
      const later = await action(rider, 'findCommuteMatches', {
        localDate: next,
      });
      assert.equal(
        later.matches[0].eta.departureEpochSeconds,
        localMinuteToEpoch(next, 480),
      );
      assert.equal(
        calls.length,
        6,
        'same points on another date cannot reuse a prior forecast',
      );
      const cached = await db.collection('_m3RouteCache').get();
      assert.ok(
        cached.docs.every(
          (d) => d.data().expiresAtMs - d.readTime.toMillis() <= 120000,
        ),
        'traffic cache expiry is at most two minutes',
      );
      for (const d of [driver, driver2])
        await db
          .doc(`users/${d.uid}/commutes/primary`)
          .update({ discoveryEnabled: false });
      const before = calls.length;
      assert.equal(
        (await action(rider, 'findCommuteMatches', { localDate: next })).matches
          .length,
        0,
      );
      assert.equal(calls.length, before);
      await db
        .doc(`users/${driver.uid}/commutes/primary`)
        .update({ discoveryEnabled: true });
      await assert.rejects(
        action(rider, 'findCommuteMatches', {
          localDate: next,
          cursor: later.nextCursor,
        }),
        { code: 'functions/aborted' },
      );
      // Expired forecasts are not used after a provider failure.
      await Promise.all(
        cached.docs.map((d) => d.ref.update({ expiresAtMs: 0 })),
      );
      providerFails = true;
      const failed = await action(rider, 'findCommuteMatches', {
        localDate: next,
      });
      assert.equal(failed.matches.length, 0);
      assert.equal(failed.unknownCount, 1);
      assert.equal(
        (await db.doc('_m3Routing/publicOsrm').get()).data().owner,
        null,
      );
      providerFails = false;
      const month = new Date().toISOString().slice(0, 7);
      await db.doc('_m3Routing/tomtomBudget').set({ month, count: 50 });
      const day = weekdayForDate(date);
      const input = {
        startPoint: pickup,
        campusLot: 'westSide',
        day,
        arriveBy: 540,
      };
      await db.doc('_m3Routing/publicOsrm').set({ owner: 'held-by-search' });
      const guardedCalls = calls.length;
      await assert.rejects(
        httpsCallable(rider.functions, 'estimateCommuteStart')(input),
        { code: 'functions/resource-exhausted' },
      );
      assert.equal(
        calls.length,
        guardedCalls,
        'onboarding cannot bypass a search owner',
      );
      await db
        .doc('_m3Routing/publicOsrm')
        .set({ owner: null, availableAtMs: 0 });
      const morning = await action(rider, 'estimateCommuteStart', input);
      assert.equal(morning.model, 'TRAFFIC_FORECAST');
      assert.equal(morning.localDate, nextForecastDate(day, Date.now() / 1000));
      assert.equal(morning.durationSeconds, 2700);
      assert.equal(morning.suggestedStartAt, 495);
      assert.equal(
        calls.at(-1).arrival,
        localMinuteToEpoch(morning.localDate, 540),
      );
      assert.equal(
        (await db.doc('_m3Routing/tomtomBudget').get()).data().count,
        51,
        '50 requests no longer stops the demo',
      );
      const cachedCalls = calls.length;
      await action(driver2, 'estimateCommuteStart', input);
      assert.equal(
        calls.length,
        cachedCalls,
        'onboarding cache is shared across accounts',
      );
      const evening = await action(rider, 'estimateCommuteStart', {
        ...input,
        arriveBy: 1275,
      });
      assert.equal(evening.durationSeconds, 1500);
      assert.equal(evening.suggestedStartAt, 1250);
      assert.equal(
        calls.at(-1).arrival,
        localMinuteToEpoch(evening.localDate, 1275),
      );
      for (const invalid of [
        { ...input, day: 'invalid' },
        { ...input, arriveBy: -1 },
        { ...input, arriveBy: 1440 },
        { ...input, arriveBy: null },
      ])
        await assert.rejects(action(rider, 'estimateCommuteStart', invalid), {
          code: 'functions/invalid-argument',
        });
      const guest = initializeApp(
        { projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' },
        'traffic-guest',
      );
      clients.push(guest);
      const guestFunctions = getFunctions(guest, 'us-central1');
      connectFunctionsEmulator(guestFunctions, '127.0.0.1', 5001);
      await assert.rejects(
        httpsCallable(guestFunctions, 'estimateCommuteStart')(input),
        { code: 'functions/permission-denied' },
      );
      providerFails = true;
      await assert.rejects(
        action(rider, 'estimateCommuteStart', { ...input, arriveBy: 600 }),
        { code: 'functions/unavailable' },
      );
      providerFails = false;
      assert.equal(
        (await db.doc('_m3Routing/publicOsrm').get()).data().owner,
        null,
      );
      await verifySymmetricRequests(t, { client, action, db, date, start, pickup, outsider });
      const quotaCache = await db.collection('_m3RouteCache').get();
      await Promise.all(quotaCache.docs.map((entry) => entry.ref.update({ expiresAtMs: 0 })));
      await db.doc('_m3Routing/tomtomBudget').set({ month, count: 17999 });
      const beforeQuota = calls.length;
      const quota = await action(rider, 'findCommuteMatches', {
        localDate: shiftDate(next, 7),
      });
      assert.equal(quota.matches.length, 0);
      assert.equal(quota.unknownCount, 1);
      assert.equal(calls.length - beforeQuota, 1);
      assert.equal(
        (await db.doc('_m3Routing/tomtomBudget').get()).data().count,
        18000,
      );
      // No client can reset the quota or inspect the private route cache.
      await assert.rejects(
        getDoc(doc(rider.db, '_m3Routing', 'tomtomBudget')),
        {
          code: 'permission-denied',
        },
      );
      await assert.rejects(
        setDoc(doc(rider.db, '_m3Routing', 'tomtomBudget'), { count: 0 }),
        { code: 'permission-denied' },
      );
    } finally {
      await Promise.all(clients.map(deleteApp));
      await deleteAdmin(admin);
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
