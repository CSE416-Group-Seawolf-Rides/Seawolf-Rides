import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { localDateAt, localMinuteToEpoch } from '../src/mvp/settings.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';

if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9095' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Test emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = adminApp({ projectId: 'demo-seawolf-rides' }, 'payments-test');
const db = adminFirestore(admin);
const apps = [];

async function client(uid) {
  await adminAuth(admin).createUser({
    uid,
    email: `${uid}@stonybrook.edu`,
    emailVerified: true,
    password: 'Emulator-test-only-123!',
  });
  const app = initializeApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 9095);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
  return { uid, db: firestore, call: (name, data) => httpsCallable(functions, name)(data).then((r) => r.data) };
}

const price = (cents) => ({ cents, riderMiles: 6, extraMiles: 1, costPerMile: 0.16, fuelType: 'gas', gasWeekOf: '2026-10-12' });

async function acceptedRide(id, { driver, rider, localDate, cents }) {
  await db.doc(`rideRequests/${id}`).set({
    schemaVersion: 1,
    source: 'CALENDAR',
    participantIds: [rider, driver],
    driverId: driver,
    riderId: rider,
    driverName: 'Alex',
    riderName: 'Maya',
    localDate,
    direction: 'TO_CAMPUS',
    status: 'ACCEPTED',
    price: price(cents),
    plan: { vehicleCampusArrival: localMinuteToEpoch(localDate, 540), riderDestinationArrival: localMinuteToEpoch(localDate, 540) },
    createdAt: 1,
    updatedAt: 1,
  });
}

test('riders settle gas shares with drivers they rode with, once, and only drivers confirm', { timeout: 120000 }, async () => {
  try {
    const driver = await client('pay-driver');
    const rider = await client('pay-rider');
    const outsider = await client('pay-outsider');
    const today = localDateAt(Math.floor(Date.now() / 1000));
    await acceptedRide('pay-past-1', { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, -2), cents: 125 });
    await acceptedRide('pay-past-2', { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, -1), cents: 100 });
    await acceptedRide('pay-future', { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, 3), cents: 100 });

    // Drivers save handles; invalid ones are rejected with a readable message.
    await assert.rejects(driver.call('savePaymentHandles', { venmo: 'no spaces allowed' }), {
      code: 'functions/invalid-argument',
    });
    await driver.call('savePaymentHandles', { venmo: '@alex-chen', zelle: 'Alex@StonyBrook.edu' });
    const own = await getDoc(doc(driver.db, `paymentHandles/${driver.uid}`));
    assert.equal(own.data().venmo, 'alex-chen');

    // Only someone who actually rode with the driver can see their payment usernames.
    assert.deepEqual((await rider.call('getPayeeHandles', { payeeId: driver.uid })).handles, {
      venmo: 'alex-chen',
      zelle: 'alex@stonybrook.edu',
    });
    await assert.rejects(outsider.call('getPayeeHandles', { payeeId: driver.uid }), {
      code: 'functions/permission-denied',
    });

    // Future rides can't be settled yet; strangers can't settle someone else's rides.
    await assert.rejects(
      rider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['pay-future'], method: 'venmo' }),
      { code: 'functions/failed-precondition' },
    );
    await assert.rejects(
      outsider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['pay-past-1'], method: 'venmo' }),
      { code: 'functions/failed-precondition' },
    );

    const settled = await rider.call('recordSettlement', {
      payeeId: driver.uid,
      requestIds: ['pay-past-1', 'pay-past-2'],
      method: 'venmo',
    });
    assert.equal(settled.cents, 225);

    // The same ride can't be marked paid twice.
    await assert.rejects(
      rider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['pay-past-2'], method: 'other' }),
      { code: 'functions/already-exists' },
    );

    // Both participants can read it; only the driver who was paid can confirm.
    const record = await getDoc(doc(rider.db, `settlements/${settled.id}`));
    assert.equal(record.data().status, 'MARKED_PAID');
    await assert.rejects(rider.call('confirmSettlement', { settlementId: settled.id }), {
      code: 'functions/permission-denied',
    });
    await driver.call('confirmSettlement', { settlementId: settled.id });
    assert.equal((await getDoc(doc(driver.db, `settlements/${settled.id}`))).data().status, 'CONFIRMED');

    // Drivers can lower or waive a rider's price; it applies to unpaid rides but never raises agreed ones.
    await acceptedRide('pay-unpaid', { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, -3), cents: 100 });
    await assert.rejects(rider.call('setPriceAdjustment', { riderId: driver.uid, adjustment: -100 }), {
      code: 'functions/permission-denied',
    });
    await assert.rejects(driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: 40 }), {
      code: 'functions/invalid-argument',
    });
    const lowered = await driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: -50 });
    assert.equal(lowered.lowered, 2); // the unpaid past ride and the upcoming one; settled rides keep their price
    const priceOf = async (id) => (await db.doc(`rideRequests/${id}`).get()).data().price;
    assert.equal((await priceOf('pay-unpaid')).cents, 50);
    assert.equal((await priceOf('pay-future')).cents, 50);
    assert.equal((await priceOf('pay-past-1')).cents, 125);
    await driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: 25 });
    assert.equal((await priceOf('pay-future')).cents, 50, 'raising never changes an agreed ride');
    const seen = await getDoc(doc(rider.db, `priceAdjustments/${driver.uid}_${rider.uid}`));
    assert.equal(seen.data().adjustment, 25);

    // Fuel efficiency is saved without wiping other vehicle fields, and validated per fuel type.
    await db.doc(`users/${driver.uid}/vehicles/primary`).set({ ownerId: driver.uid, color: 'Gray' });
    await assert.rejects(driver.call('saveFuelEfficiency', { fuelType: 'electric', efficiency: 40 }), {
      code: 'functions/invalid-argument',
    });
    await driver.call('saveFuelEfficiency', { fuelType: 'electric', efficiency: 3.4 });
    const vehicle = (await db.doc(`users/${driver.uid}/vehicles/primary`).get()).data();
    assert.equal(vehicle.fuelType, 'electric');
    assert.equal(vehicle.efficiency, 3.4);
    assert.equal(vehicle.color, 'Gray');
    await driver.call('saveFuelEfficiency', { fuelType: 'hybrid', efficiency: null });
    assert.equal((await db.doc(`users/${driver.uid}/vehicles/primary`).get()).data().efficiency, undefined);

    // A ride today is still upcoming until the later of the two agreed arrivals.
    await acceptedRide('pay-today', { driver: driver.uid, rider: rider.uid, localDate: today, cents: 300 });
    const todayRef = db.doc('rideRequests/pay-today');
    const timestamp = Math.floor(Date.now() / 1000);
    for (const plan of [
      { vehicleCampusArrival: timestamp + 3600, riderDestinationArrival: timestamp + 4200 },
      { vehicleCampusArrival: timestamp - 600, riderDestinationArrival: timestamp + 3600 },
      {},
    ]) {
      await todayRef.update({ plan });
      await assert.rejects(
        rider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['pay-today'], method: 'other' }),
        { code: 'functions/failed-precondition' },
      );
      assert.equal((await db.doc('_settledRequests/pay-today').get()).exists, false);
    }
    await todayRef.update({ plan: { vehicleCampusArrival: timestamp - 600, riderDestinationArrival: timestamp - 1 } });
    assert.equal((await rider.call('recordSettlement', {
      payeeId: driver.uid, requestIds: ['pay-today'], method: 'other',
    })).cents, 300);
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)));
    await deleteAdmin(admin);
  }
});
