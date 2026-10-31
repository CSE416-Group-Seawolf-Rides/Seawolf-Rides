import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
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
  weekdayForDate,
  localMinuteToEpoch,
} from '../src/mvp/settings.ts';
import { toPrivacyArea } from '../src/commute/commuteModel.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { mergeCalendarPages } from '../src/calendar/calendarMatching.ts';
import { vehicleFixture } from './matching-fixtures.mjs';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Test emulators required.');
const require = createRequire(
  new URL('../../functions/package.json', import.meta.url),
);
const {
  initializeApp: adminApp,
  deleteApp: deleteAdmin,
} = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = adminApp({ projectId: 'demo-seawolf-rides' }, 'calendar-test');
const db = adminFirestore(admin);
const clients = [];
let providerFails = false;
let routeCalls = 0;
const server = createServer((req, res) => {
  routeCalls++;
  res.setHeader('Content-Type', 'application/json');
  if (providerFails) {
    res.writeHead(503);
    res.end('{}');
    return;
  }
  const points = new URL(req.url, 'http://localhost').pathname
    .split('/')
    .pop()
    .split(';')
    .map((p) => p.split(',').map(Number));
  const durations = points.length === 2 ? [1800] : [600, 1500];
  res.end(
    JSON.stringify({
      code: 'Ok',
      waypoints: points.map((location) => ({
        location,
        distance: 0,
        name: '',
      })),
      routes: [
        {
          duration: durations.reduce((a, b) => a + b, 0),
          distance: 10000,
          geometry: { type: 'LineString', coordinates: points },
          legs: durations.map((duration, i) => ({
            duration,
            distance: 5000,
            summary: '',
            steps: [
              {
                duration,
                distance: 5000,
                name: 'Test road',
                geometry: {
                  type: 'LineString',
                  coordinates: [points[i], points[i + 1]],
                },
                maneuver: { type: 'depart', location: points[i] },
              },
            ],
          })),
        },
      ],
    }),
  );
});
async function client(uid) {
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
  return { uid, db: database, functions };
}
async function action(client, name, data) {
  for (let i = 0; i < 10; i++) {
    try {
      return (
        await httpsCallable(client.functions, name, { timeout: 120000 })(data)
      ).data;
    } catch (e) {
      if (e.code !== 'functions/resource-exhausted' || i === 9) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}
test(
  'calendar real accounts: date exceptions, proposed timing, private locations, acceptance and locks',
  { timeout: 120000 },
  async () => {
    await new Promise((resolve) => server.listen(5009, '127.0.0.1', resolve));
    try {
      const driver = await client('calendar-a-driver'),
        rider = await client('calendar-b-rider'),
        outsider = await client('calendar-outsider');
      const date = localDateAt(Date.now() / 1000 + 86400);
      const point = { latitude: 40.92047, longitude: -73.12844 };
      for (const [account, mode, role] of [
        [driver, 'drive', 'driver'],
        [rider, 'ride', 'rider'],
      ]) {
        await setDoc(doc(account.db, 'users', account.uid), {
          schemaVersion: 1,
          firstName: role,
          role,
          updatedAt: new Date(),
        });
        await setDoc(
          doc(account.db, 'users', account.uid, 'commutes', 'primary'),
          {
            schemaVersion: 1,
            ownerId: account.uid,
            startPoint: point,
            startArea: toPrivacyArea(point, 'Stony Brook area'),
            discoveryEnabled: true,
            campusLot: 'westSide',
            days: [
              {
                day: weekdayForDate(date),
                mode,
                startAt: 480,
                arriveBy: 540,
                leaveAt: 1020,
              },
            ],
            ...(role === 'driver' ? { seats: 1 } : {}),
            updatedAt: new Date(),
          },
        );
      }
      await assert.rejects(
        getDoc(doc(rider.db, 'users', driver.uid, 'commutes', 'primary')),
        {
          code: 'permission-denied',
        },
      );
      await assert.rejects(
        setDoc(doc(rider.db, 'users', rider.uid, 'commuteDays', date), {
          mode: 'drive',
        }),
        { code: 'permission-denied' },
      );
      const estimate = await action(driver, 'estimateCommuteStart', {
        startPoint: point,
        campusLot: 'westSide',
      });
      assert.deepEqual(estimate, { durationSeconds: 1800 });
      await assert.rejects(
        action(driver, 'estimateCommuteStart', {
          startPoint: { latitude: 91, longitude: 0 },
          campusLot: 'westSide',
        }),
        { code: 'functions/invalid-argument' },
      );
      const search = await action(rider, 'findCommuteMatches', {
        localDate: date,
      });
      assert.equal(search.matches.length, 1);
      const match = search.matches[0];
      assert.equal(match.driverId, driver.uid);
      assert.equal(match.riderId, rider.uid);
      assert.equal(match.plan.departure, localMinuteToEpoch(date, 500));
      const riderDoc = db.doc(`users/${rider.uid}/commutes/primary`);
      const savedDays = (await riderDoc.get()).data().days;
      await riderDoc.update({
        days: savedDays.map((d) => ({ ...d, startAt: 538 })),
      });
      const tooEarly = await action(rider, 'findCommuteMatches', {
        localDate: date,
      });
      assert.equal(tooEarly.matches.length, 0);
      assert.equal(tooEarly.incompatibleCount, 1);
      await riderDoc.update({ days: savedDays });
      assert.equal('startPoint' in match, false);
      assert.equal('riderPickup' in match, false);
      assert.notDeepEqual(match.area.center, point);
      assert.ok(
        match.plan.departure < match.plan.pickup &&
          match.plan.pickup < match.plan.vehicleCampusArrival,
      );
      const passengers = await action(driver, 'findCommuteMatches', {
        localDate: date,
      });
      assert.equal(passengers.matches[0].role, 'rider');
      await db.doc(`users/${rider.uid}/commutes/primary`).update({ seats: 1 });
      await action(driver, 'setCommuteDay', {
        localDate: date,
        mode: 'either',
      });
      await action(rider, 'setCommuteDay', { localDate: date, mode: 'either' });
      const flexible = await action(rider, 'findCommuteMatches', {
        localDate: date,
      });
      assert.deepEqual(flexible.matches.map((m) => m.role).sort(), [
        'driver',
        'rider',
      ]);
      await action(rider, 'setCommuteDay', {
        localDate: date,
        mode: 'default',
      });
      await action(driver, 'setCommuteDay', { localDate: date, mode: 'off' });
      assert.equal(
        (await action(rider, 'findCommuteMatches', { localDate: date })).matches
          .length,
        0,
      );
      assert.equal(
        (
          await getDoc(
            doc(driver.db, 'users', driver.uid, 'commutes', 'primary'),
          )
        ).data().days[0].mode,
        'drive',
      );
      await action(driver, 'setCommuteDay', {
        localDate: date,
        mode: 'default',
      });
      const fresh = (
        await action(rider, 'findCommuteMatches', { localDate: date })
      ).matches[0];
      const input = {
        source: 'CALENDAR',
        proposedPlan: {
          departure: fresh.plan.departure,
          pickup: fresh.plan.pickup,
          vehicleCampusArrival: fresh.plan.vehicleCampusArrival,
        },
        direction: 'TO_CAMPUS',
        driverId: fresh.driverId,
        driverRevision: fresh.driverRevision,
        riderRevision: fresh.riderRevision,
        localDate: date,
      };
      await assert.rejects(
        action(rider, 'createRideRequest', {
          ...input,
          proposedPlan: {
            ...input.proposedPlan,
            pickup: input.proposedPlan.pickup + 60,
          },
        }),
        { code: 'functions/aborted' },
      );
      const pending = await action(rider, 'createRideRequest', input);
      assert.equal(pending.status, 'PENDING');
      assert.equal(
        (await getDoc(doc(driver.db, 'rideRequests', pending.id))).data()
          .status,
        'PENDING',
      );
      assert.equal(
        (await db.doc(`ridePickups/${pending.id}`).get()).exists,
        false,
      );
      await assert.rejects(getDoc(doc(driver.db, 'ridePickups', pending.id)), {
        code: 'permission-denied',
      });
      await assert.rejects(
        action(rider, 'respondToRideRequest', {
          requestId: pending.id,
          decision: 'ACCEPTED',
        }),
        { code: 'functions/permission-denied' },
      );
      await assert.rejects(
        action(driver, 'respondToRideRequest', {
          requestId: pending.id,
          decision: 'ACCEPTED',
        }),
        (error) =>
          error.code === 'functions/failed-precondition' &&
          error.details?.reason === 'VEHICLE_REQUIRED',
      );
      assert.equal(
        (await db.doc(`rideRequests/${pending.id}`).get()).data().status,
        'PENDING',
      );
      assert.equal(
        (
          await db
            .collection('_rideCommitments')
            .where('requestId', '==', pending.id)
            .get()
        ).size,
        0,
      );
      await assert.rejects(
        action(rider, 'saveVehicleDetails', vehicleFixture(driver.uid)),
        { code: 'functions/invalid-argument' },
      );
      await assert.rejects(
        action(driver, 'saveVehicleDetails', {
          ...vehicleFixture(driver.uid),
          verified: true,
        }),
        { code: 'functions/invalid-argument' },
      );
      await action(driver, 'saveVehicleDetails', vehicleFixture(driver.uid));
      // Future preferences never rewrite an existing request, even before acceptance.
      const lockedPrice = (await db.doc(`rideRequests/${pending.id}`).get()).data().price;
      await action(driver, 'setPriceAdjustment', { riderId: rider.uid, adjustment: -50 });
      assert.deepEqual((await db.doc(`rideRequests/${pending.id}`).get()).data().price, lockedPrice);
      await action(driver, 'setPriceAdjustment', { riderId: rider.uid, adjustment: 25 });
      await action(driver, 'saveFuelEfficiency', { fuelType: 'gas', efficiency: 10 });
      assert.deepEqual((await db.doc(`rideRequests/${pending.id}`).get()).data().price, lockedPrice);
      assert.equal(
        (
          await getDoc(
            doc(driver.db, 'users', driver.uid, 'vehicles', 'primary'),
          )
        ).data().plate,
        'DEMO 123',
      );
      await assert.rejects(
        getDoc(doc(rider.db, 'users', driver.uid, 'vehicles', 'primary')),
        { code: 'permission-denied' },
      );
      await assert.rejects(
        setDoc(
          doc(driver.db, 'users', driver.uid, 'vehicles', 'primary'),
          vehicleFixture(driver.uid),
        ),
        { code: 'permission-denied' },
      );
      assert.equal(
        (
          await action(driver, 'respondToRideRequest', {
            requestId: pending.id,
            decision: 'ACCEPTED',
          })
        ).status,
        'ACCEPTED',
      );
      assert.deepEqual((await db.doc(`rideRequests/${pending.id}`).get()).data().price, lockedPrice);
      for (const account of [rider, driver]) {
        assert.deepEqual(
          (await getDoc(doc(account.db, 'ridePickups', pending.id))).data()
            .riderPickup,
          point,
        );
        assert.equal(
          (await getDoc(doc(account.db, 'rideRequests', pending.id))).data()
            .status,
          'ACCEPTED',
        );
      }
      await assert.rejects(
        getDoc(doc(outsider.db, 'ridePickups', pending.id)),
        {
          code: 'permission-denied',
        },
      );
      await assert.rejects(
        action(driver, 'setCommuteDay', { localDate: date, mode: 'ride' }),
        {
          code: 'functions/failed-precondition',
        },
      );
      assert.equal(
        (
          await action(driver, 'respondToRideRequest', {
            requestId: pending.id,
            decision: 'ACCEPTED',
          })
        ).status,
        'ACCEPTED',
      );
      // Persist a separate exception for restart verification, without changing the recurring week.
      await action(driver, 'setCommuteDay', {
        localDate: shiftDate(date, 1),
        mode: 'either',
      });
      // Provider failure uses different coordinates to bypass the existing private route cache.
      providerFails = true;
      const ref = db.doc(`users/${driver.uid}/commutes/primary`);
      await ref.update({
        startPoint: { latitude: 40.9346, longitude: -73.0524 },
      });
      await action(rider, 'setCommuteDay', {
        localDate: shiftDate(date, 1),
        mode: 'ride',
      });
      const unavailable = await action(rider, 'findCommuteMatches', {
        localDate: shiftDate(date, 1),
      });
      assert.equal(unavailable.matches.length, 0);
      assert.ok(unavailable.unknownCount > 0);

      // Separate real accounts/campus exercise complete discovery with bounded routing pages.
      providerFails = false;
      const pageDate = shiftDate(date, 2);
      const pageRider = await client('paging-rider');
      const pageDrivers = [];
      for (const [id, role, startAt, arriveBy] of [
        ['paging-rider', 'rider', 480, 540],
        ['paging-a', 'driver', 480, 540],
        ['paging-b', 'driver', 503, 540],
        ['paging-c', 'driver', 505, 544],
        ['paging-far', 'driver', 503, 571],
      ]) {
        const account = id === pageRider.uid ? pageRider : await client(id);
        if (role === 'driver') pageDrivers.push(account);
        await setDoc(doc(account.db, 'users', id), {
          schemaVersion: 1,
          firstName: id,
          role,
          updatedAt: new Date(),
        });
        await setDoc(doc(account.db, 'users', id, 'commutes', 'primary'), {
          schemaVersion: 1,
          ownerId: id,
          startPoint: point,
          startArea: toPrivacyArea(point, 'Stony Brook area'),
          discoveryEnabled: true,
          campusLot: 'eastSide',
          days: [
            {
              day: weekdayForDate(pageDate),
              mode: role === 'driver' ? 'drive' : 'ride',
              startAt,
              arriveBy,
              leaveAt: 1020,
            },
          ],
          ...(role === 'driver' ? { seats: 1 } : {}),
          updatedAt: new Date(),
        });
      }
      const beforePage = routeCalls;
      const first = await action(pageRider, 'findCommuteMatches', {
        localDate: pageDate,
      });
      assert.equal(first.policyVersion, 3);
      assert.equal(
        first.totalCandidatePlans,
        3,
        'target more than 30 minutes away is excluded before routing',
      );
      assert.equal(first.checkedCandidatePlans, 2);
      assert.equal(first.incomplete, true);
      assert.ok(first.nextCursor);
      assert.ok(
        routeCalls - beforePage <= 4,
        'each explicit page has a bounded provider budget',
      );
      assert.deepEqual(
        first.matches.map((m) => m.driverId),
        ['paging-a', 'paging-b'],
      );
      const second = await action(pageRider, 'findCommuteMatches', {
        localDate: pageDate,
        cursor: first.nextCursor,
      });
      assert.equal(second.checkedCandidatePlans, 3);
      assert.equal(second.incomplete, false);
      assert.equal(second.nextCursor, null);
      const all = mergeCalendarPages(first, second);
      assert.deepEqual(
        all.matches.map((m) => m.driverId),
        ['paging-a', 'paging-b', 'paging-c'],
      );
      assert.deepEqual(
        all.matches.map((m) => m.arrivalDifferenceSeconds),
        [0, 0, 0],
      );
      for (const match of all.matches) {
        assert.equal(match.plan.pickup - match.plan.departure, 600);
        assert.equal(
          match.plan.riderDestinationArrival - match.plan.departure,
          2220,
        );
        assert.equal(match.addedDrivingSeconds, 420);
        assert.equal(match.startPoint, undefined);
        assert.equal(match.riderPickup, undefined);
      }
      // A driver-facing search also scores its own ETA and keeps the other person's identity.
      const driving = await action(pageDrivers[1], 'findCommuteMatches', {
        localDate: pageDate,
      });
      assert.equal(driving.matches[0].riderId, pageRider.uid);
      assert.equal(driving.matches[0].name, 'paging-rider');
      assert.equal(driving.matches[0].role, 'rider');
      assert.equal(driving.matches[0].arrivalDifferenceSeconds, 0);
      await assert.rejects(
        action(pageRider, 'findCommuteMatches', {
          localDate: pageDate,
          cursor: 'bad!',
        }),
        { code: 'functions/invalid-argument' },
      );
      await db
        .doc('users/paging-c/commutes/primary')
        .update({ discoveryEnabled: false });
      await assert.rejects(
        action(pageRider, 'findCommuteMatches', {
          localDate: pageDate,
          cursor: first.nextCursor,
        }),
        { code: 'functions/aborted' },
      );
    } finally {
      // Each fake-router suite must start cold; cached estimates outlive a test process.
      const cached = await db.collection('_m3RouteCache').get();
      await Promise.all(cached.docs.map((item) => item.ref.delete()));
      await Promise.all(clients.map(deleteApp));
      await deleteAdmin(admin);
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
