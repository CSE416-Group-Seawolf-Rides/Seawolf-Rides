// Explicit, tiny live smoke: invoke the real local callable; never fetch OSRM directly.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { commuteKey, localDateAt, weekdayForDate } from '../src/mvp/settings.ts';

if (process.argv.slice(2).join(' ') !== '--live-osrm')
  throw new Error('Pass --live-osrm to permit a minimal public routing smoke test.');
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9095';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const projectId = 'demo-seawolf-rides';
const admin = adminApp({ projectId });
const db = adminFirestore(admin);
const uidPrefix = `smoke-${Date.now()}`;
const password = 'Local-smoke-only-123!';
const uids = [];
const apps = [];
try {
  const date = localDateAt(Date.now() / 1000 + 86400);
  const weekday = weekdayForDate(date);
  for (const mode of ['driver', 'rider']) {
    const uid = `${uidPrefix}-${mode}`;
    await adminAuth(admin).createUser({
      uid,
      email: `${uid}@stonybrook.edu`,
      password,
      emailVerified: true,
    });
    uids.push(uid);
    const commute = {
      schemaVersion: 1,
      ownerId: uid,
      startArea: {
        center: { latitude: 40.9, longitude: -73.1 },
        radiusMiles: 2,
        label: 'Stony Brook area',
      },
      campusLot: 'westSide',
      days: [
        {
          day: weekday,
          mode: mode === 'driver' ? 'drive' : 'ride',
          arriveBy: 540,
          leaveAt: null,
        },
      ],
      ...(mode === 'driver' ? { seats: 2 } : {}),
    };
    await db.doc(`users/${uid}`).set({ schemaVersion: 1, firstName: `Smoke ${mode}`, role: mode });
    await db.doc(`users/${uid}/commutes/primary`).set(commute);
    await db.doc(`matchingSetups/${uid}`).set({
      schemaVersion: 1,
      ownerId: uid,
      revision: 'smoke-v1',
      commuteKey: commuteKey(commute),
      mode,
      active: true,
      optIn: true,
      campusLot: 'westSide',
      weekdays: [weekday],
      pointId: 'stony-brook-station',
      startWindow: { earliest: mode === 'driver' ? 450 : 480, latest: 510 },
      arrivalWindow: { earliest: 480, latest: 540 },
      seatsRequested: 1,
      maxDetourSeconds: 600,
      maxExtraRideSeconds: 900,
      accessWalkSeconds: 0,
      egressWalkSeconds: 0,
      maxAccessWalkSeconds: 0,
      maxEgressWalkSeconds: 0,
    });
  }
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uidPrefix);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInWithEmailAndPassword(auth, `${uidPrefix}-rider@stonybrook.edu`, password);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const call = httpsCallable(functions, 'findCompatibleDrivers', {
    timeout: 120000,
  });
  const search = (
    await call({
      localDate: date,
      revision: 'smoke-v1',
      direction: 'TO_CAMPUS',
    })
  ).data;
  assert.ok(
    search.recommendations.some((card) => card.driverId === `${uidPrefix}-driver`),
    JSON.stringify(search),
  );
  await new Promise((resolve) => setTimeout(resolve, 1300));
  const preview = (await call({ action: 'PREVIEW', revision: 'smoke-v1' })).data;
  assert.equal(preview.status, 'SUCCESS');
  assert.equal(preview.route.provider.baseUrl, 'https://router.project-osrm.org');
  assert.ok(preview.route.distanceMeters > 0);
  assert.equal((await db.doc('_m3Routing/publicOsrm').get()).data().owner, null);
  console.log(
    JSON.stringify(
      {
        liveSmoke: 'PASS',
        projectId,
        localDate: date,
        recommendedDriver: `${uidPrefix}-driver`,
        distanceMeters: preview.route.distanceMeters,
        durationSeconds: preview.route.durationSeconds,
        metrics: search.recommendations.find((card) => card.driverId === `${uidPrefix}-driver`)
          .metrics,
        candidateLimitReached: search.candidateLimitReached,
      },
      null,
      2,
    ),
  );
} finally {
  // Delete only accounts/documents created by this smoke, never the user's saved demo accounts/cache.
  for (const uid of uids) {
    await db.doc(`matchingSetups/${uid}`).delete();
    await db.doc(`users/${uid}/commutes/primary`).delete();
    await db.doc(`users/${uid}`).delete();
    await adminAuth(admin).deleteUser(uid);
  }
  await Promise.all(apps.map(deleteApp));
  await deleteAdmin(admin);
}
