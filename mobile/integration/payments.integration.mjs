import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';
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

    // Driver preferences affect new quotes only; existing prices require explicit approval.
    await acceptedRide('pay-unpaid', { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, -3), cents: 100 });
    await assert.rejects(rider.call('setPriceAdjustment', { riderId: driver.uid, adjustment: -100 }), {
      code: 'functions/permission-denied',
    });
    await assert.rejects(driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: 40 }), {
      code: 'functions/invalid-argument',
    });
    const lowered = await driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: -50 });
    assert.equal(lowered.lowered, 0);
    const priceOf = async (id) => (await db.doc(`rideRequests/${id}`).get()).data().price;
    assert.equal((await priceOf('pay-unpaid')).cents, 100);
    assert.equal((await priceOf('pay-future')).cents, 100);
    assert.equal((await priceOf('pay-past-1')).cents, 125);
    await driver.call('setPriceAdjustment', { riderId: rider.uid, adjustment: 25 });
    assert.equal((await priceOf('pay-future')).cents, 100, 'raising never changes an agreed ride');
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

    // Both participants can propose; only the other person can approve an agreed-price change.
    const negotiable = async (id) => {
      await acceptedRide(id, { driver: driver.uid, rider: rider.uid, localDate: shiftDate(today, -1), cents: 300 });
      await db.doc(`rideRequests/${id}`).update({ price: { ...price(300), baseCents: 100, suggestedCents: 300, costPerMile: 0.4 } });
    };
    const readRide = async (id) => (await db.doc(`rideRequests/${id}`).get()).data();
    const propose = (actor, requestId, proposalId, cents, expectedCents = 300) => actor.call('proposeRidePriceChange', { requestId, proposalId, cents, expectedCents });
    const respond = (actor, requestId, proposalId, decision) => actor.call('respondToRidePriceChange', { requestId, proposalId, decision });
    await negotiable('price-change');
    await assert.rejects(propose(outsider, 'price-change', 'outsider-proposal-001', 350), { code: 'functions/permission-denied' });
    for (const cents of [-25, 10, 400, '350'])
      await assert.rejects(propose(driver, 'price-change', 'invalid-proposal-0001', cents), { code: 'functions/invalid-argument' });
    await assert.rejects(propose(driver, 'price-change', 'stale-proposal-00001', 350, 250), { code: 'functions/aborted' });
    await propose(driver, 'price-change', 'driver-proposal-0001', 350);
    const attemptDoc = (await db.collection('_priceChangeAttempts').where('id', '==', 'driver-proposal-0001').get()).docs[0];
    await assert.rejects(getDoc(doc(rider.db, attemptDoc.ref.path)), { code: 'permission-denied' });
    await propose(driver, 'price-change', 'driver-proposal-0001', 350); // retry is idempotent
    assert.equal((await readRide('price-change')).price.cents, 300, 'sending a proposal never changes the agreed price');
    await assert.rejects(respond(driver, 'price-change', 'driver-proposal-0001', 'ACCEPTED'), { code: 'functions/permission-denied' });
    await assert.rejects(respond(rider, 'price-change', 'driver-proposal-0001', 'CANCELLED'), { code: 'functions/permission-denied' });
    await assert.rejects(respond(outsider, 'price-change', 'driver-proposal-0001', 'ACCEPTED'), { code: 'functions/permission-denied' });
    await assert.rejects(propose(rider, 'price-change', 'crossed-proposal-001', 250), { code: 'functions/failed-precondition' });
    await assert.rejects(setDoc(doc(rider.db, 'rideRequests/price-change'), { price: price(1) }, { merge: true }), { code: 'permission-denied' });
    await respond(rider, 'price-change', 'driver-proposal-0001', 'DECLINED');
    assert.equal((await readRide('price-change')).price.cents, 300);
    assert.equal((await readRide('price-change')).status, 'ACCEPTED', 'rejecting a price does not cancel the ride');
    assert.equal((await propose(driver, 'price-change', 'driver-proposal-0001', 350)).status, 'DECLINED');
    await propose(rider, 'price-change', 'rider-proposal-00001', 250);
    await assert.rejects(respond(rider, 'price-change', 'rider-proposal-00001', 'ACCEPTED'), { code: 'functions/permission-denied' });
    await respond(driver, 'price-change', 'rider-proposal-00001', 'ACCEPTED');
    await respond(driver, 'price-change', 'rider-proposal-00001', 'ACCEPTED');
    assert.equal((await propose(driver, 'price-change', 'driver-proposal-0001', 350)).status, 'DECLINED', 'a delayed retry cannot recreate an old request');
    const agreed = await readRide('price-change');
    assert.equal(agreed.price.cents, 250);
    assert.equal(agreed.price.suggestedCents, 300);
    assert.equal(agreed.price.negotiated, true);
    await assert.rejects(respond(rider, 'price-change', 'driver-proposal-0001', 'ACCEPTED'), { code: 'functions/aborted' });
    await assert.rejects(rider.call('recordSettlement', {
      payeeId: driver.uid, requestIds: ['price-change'], method: 'other', expectedCents: 300,
    }), { code: 'functions/aborted' });
    assert.equal((await db.doc('_settledRequests/price-change').get()).exists, false);
    await propose(driver, 'price-change', 'cancelled-proposal-01', 350, 250);
    await respond(driver, 'price-change', 'cancelled-proposal-01', 'CANCELLED');
    assert.equal((await readRide('price-change')).price.cents, 250);
    await propose(driver, 'price-change', 'free-ride-proposal-01', 0, 250);
    await respond(rider, 'price-change', 'free-ride-proposal-01', 'ACCEPTED');
    assert.equal((await readRide('price-change')).price.cents, 0);
    await assert.rejects(propose(driver, 'price-change', 'ratchet-proposal-0001', 400, 0), { code: 'functions/invalid-argument' });

    await negotiable('price-crossed');
    const crossed = await Promise.allSettled([
      propose(driver, 'price-crossed', 'crossed-driver-00001', 350),
      propose(rider, 'price-crossed', 'crossed-rider-000001', 250),
    ]);
    assert.equal(crossed.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await readRide('price-crossed')).price.cents, 300);
    const activeChange = (await readRide('price-crossed')).priceChange;
    const recipient = activeChange.recipientId === driver.uid ? driver : rider;
    const decisions = await Promise.allSettled([
      respond(recipient, 'price-crossed', activeChange.id, 'ACCEPTED'),
      respond(recipient, 'price-crossed', activeChange.id, 'DECLINED'),
    ]);
    assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
    const decided = await readRide('price-crossed');
    assert.equal(decided.price.cents, decided.priceChange.status === 'ACCEPTED' ? activeChange.toCents : 300);

    // Paying the current agreement expires the outstanding proposal and prevents further edits.
    await negotiable('price-settled');
    await propose(driver, 'price-settled', 'settled-proposal-001', 350);
    await rider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['price-settled'], method: 'other', expectedCents: 300 });
    assert.equal((await readRide('price-settled')).priceChange.status, 'EXPIRED');
    await assert.rejects(respond(rider, 'price-settled', 'settled-proposal-001', 'ACCEPTED'), { code: 'functions/failed-precondition' });
    await assert.rejects(propose(rider, 'price-settled', 'after-paid-proposal1', 250), { code: 'functions/failed-precondition' });

    // An acceptance/payment race either pays the old price or accepts the new one, never both.
    await negotiable('price-race');
    await propose(driver, 'price-race', 'race-price-proposal1', 350);
    const race = await Promise.allSettled([
      respond(rider, 'price-race', 'race-price-proposal1', 'ACCEPTED'),
      rider.call('recordSettlement', { payeeId: driver.uid, requestIds: ['price-race'], method: 'other', expectedCents: 300 }),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    const raced = await readRide('price-race');
    assert.equal(raced.price.cents, raced.settledAt === undefined ? 350 : 300);
    assert.equal(raced.priceChange.status, raced.settledAt === undefined ? 'ACCEPTED' : 'EXPIRED');

  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)));
    await deleteAdmin(admin);
  }
});
