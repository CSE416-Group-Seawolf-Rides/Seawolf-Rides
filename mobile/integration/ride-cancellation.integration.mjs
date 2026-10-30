import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { localDateAt, localMinuteToEpoch, weekdayForDate } from '../src/mvp/settings.ts';
import { saveMatchingFixture } from './matching-fixtures.mjs';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { currentCarpools, rideHistory } from '../src/mvp/ridePresentation.ts';
import { computeBalances } from '../src/payments/tally.ts';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
if (!authHost?.startsWith('127.0.0.1:') || !firestoreHost?.startsWith('127.0.0.1:') || !functionsHost.startsWith('127.0.0.1:'))
  throw new Error('Isolated loopback emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const { requestIdFor, commitmentIdFor, commitAcceptance } = require('./lib/functions/src/rideRequests');
const { chatIdFor } = require('./lib/functions/src/chatThreads');
const admin = adminApp({ projectId: 'demo-seawolf-rides' });
const db = adminFirestore(admin);
const apps = [];
let driver, rider, outsider, counter = 0;

async function client(uid) {
  await adminAuth(admin).createUser({ uid, email: `${uid}@stonybrook.edu`, emailVerified: true, password: 'Emulator-test-only-123!' });
  const app = initializeApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, uid);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', Number(firestoreHost.split(':')[1]));
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', Number(functionsHost.split(':')[1]));
  await signInWithEmailAndPassword(auth, `${uid}@stonybrook.edu`, 'Emulator-test-only-123!');
  return { uid, db: firestore, functions, call: (name, data) => httpsCallable(functions, name, { timeout: 120000 })(data).then((r) => r.data) };
}
before(async () => {
  driver = await client('cancellation-driver');
  rider = await client('cancellation-rider');
  outsider = await client('cancellation-outsider');
});
after(async () => { await Promise.all(apps.map(deleteApp)); await deleteAdmin(admin); });

async function seed(changes = {}, { commitments = true, thread = true } = {}) {
  const localDate = shiftDate(localDateAt(Date.now() / 1000), ++counter);
  const departure = localMinuteToEpoch(localDate, 450);
  const id = requestIdFor(rider.uid, driver.uid, localDate);
  const value = {
    id, schemaVersion: 1, source: 'CALENDAR', initiatorId: rider.uid, attemptId: `cancellation-attempt-${counter}`,
    participantIds: [rider.uid, driver.uid], driverId: driver.uid, riderId: rider.uid,
    driverName: 'Alex', riderName: 'Maya', localDate, direction: 'TO_CAMPUS', status: 'ACCEPTED',
    riderRevision: 'r1', driverRevision: 'd1', seats: 1, pickupLabel: 'Station', campusLabel: 'West Side',
    plan: { departure, pickup: departure + 600, vehicleCampusArrival: departure + 1800, riderDestinationArrival: departure + 2100 },
    metrics: { driverExtraDurationSeconds: 300 },
    price: { cents: 300, baseCents: 100, suggestedCents: 300, riderMiles: 6, extraMiles: 1, costPerMile: .4, fuelType: 'gas', gasWeekOf: '2026-10-12' },
    createdAt: 1, updatedAt: 1, ...changes,
  };
  const chatId = chatIdFor(driver.uid, rider.uid);
  const refs = [driver.uid, rider.uid].map((uid) => db.doc(`_rideCommitments/${commitmentIdFor(uid, localDate)}`));
  const batch = db.batch();
  batch.set(db.doc(`rideRequests/${id}`), value);
  if (commitments) for (const ref of refs) batch.set(ref, { requestId: id, localDate, direction: 'TO_CAMPUS', reservedSeats: 1 });
  batch.set(db.doc(`ridePickups/${id}`), { participantIds: value.participantIds, driverStart: { latitude: 40.9, longitude: -73.1 }, riderPickup: { latitude: 40.91, longitude: -73.12 } });
  if (thread && !(await db.doc(`chats/${chatId}`).get()).exists)
    batch.set(db.doc(`chats/${chatId}`), {
      schemaVersion: 1, participantIds: [driver.uid, rider.uid].sort(), names: { [driver.uid]: 'Alex', [rider.uid]: 'Maya' },
      requestId: id, localDate, campusLabel: value.campusLabel, createdAt: 1, updatedAt: 1, messageCount: 0, lastMessage: '',
    });
  await batch.commit();
  return { ...value, refs, chatId };
}
const cancel = (actor, ride, reason = 'My class was cancelled.') => actor.call('cancelAcceptedRide', {
  requestId: ride.id, ...(ride.attemptId ? { attemptId: ride.attemptId } : {}), reason,
});
const read = async (ride) => (await db.doc(`rideRequests/${ride.id}`).get()).data();
function watch(database, path, accept) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timer = setTimeout(() => { stop(); reject(new Error(`No update at ${path}`)); }, 15000);
    stop = onSnapshot(doc(database, path), (snapshot) => {
      if (accept(snapshot.data())) { clearTimeout(timer); stop(); resolve(snapshot.data()); }
    }, (error) => { clearTimeout(timer); stop(); reject(error); });
  });
}

test('either participant cancels one dated ride; both listeners and shared chat receive the reason exactly once', { timeout: 90000 }, async () => {
  for (const actor of [rider, driver]) {
    const ride = await seed();
    const otherDate = await seed();
    const before = (await db.doc(`chats/${ride.chatId}`).get()).data().messageCount;
    const updates = [driver, rider].map((client) => watch(client.db, `rideRequests/${ride.id}`, (value) => value?.status === 'CANCELLED'));
    const message = watch(rider.db, `chats/${ride.chatId}`, (value) => value?.messageCount === before + 1);
    await Promise.all([cancel(actor, ride, '  My class was cancelled.  '), cancel(actor, ride, '  My class was cancelled.  ')]);
    for (const value of await Promise.all(updates)) {
      assert.equal(value.cancellation.reason, 'My class was cancelled.');
      assert.equal(value.cancellation.cancelledBy, actor.uid);
      assert.ok(value.cancellation.cancelledAt > 0);
      assert.equal(value.price.cents, 300);
      assert.equal(currentCarpools([value], actor.uid, Date.now() / 1000).length, 0);
      assert.equal(rideHistory([value], actor.uid, Date.now() / 1000).length, 1);
      assert.equal(computeBalances(actor.uid, [value], [], Date.now() / 1000).length, 0);
    }
    assert.match((await message).lastMessage, /Reason: My class was cancelled\./);
    const messages = await getDocs(query(collection(rider.db, `chats/${ride.chatId}/messages`), where('requestId', '==', ride.id)));
    assert.equal(messages.size, 1);
    assert.equal(messages.docs[0].data().senderId, actor.uid);
    assert.match(messages.docs[0].data().text, new RegExp(ride.localDate));
    assert.ok((await Promise.all(ride.refs.map((ref) => ref.get()))).every((s) => !s.exists));
    assert.equal((await db.doc(`ridePickups/${ride.id}`).get()).exists, false);
    await assert.rejects(getDoc(doc(driver.db, `ridePickups/${ride.id}`)), { code: 'permission-denied' });
    assert.equal((await read(otherDate)).status, 'ACCEPTED');
    assert.ok((await Promise.all(otherDate.refs.map((ref) => ref.get()))).every((s) => s.exists));
    await assert.rejects(driver.call('recordSettlement', { payeeId: rider.uid, requestIds: [ride.id], method: 'other' }), { code: 'functions/failed-precondition' });
  }
});

test('blank/oversized reasons, outsiders, unauthenticated callers and client writes cannot cancel', async () => {
  const ride = await seed();
  for (const reason of ['', ' \n\t ', 'a'.repeat(501), null, 42])
    await assert.rejects(cancel(rider, ride, reason), { code: 'functions/invalid-argument' });
  await assert.rejects(cancel(outsider, ride), { code: 'functions/permission-denied' });
  await assert.rejects(rider.call('cancelRideRequest', { requestId: ride.id, attemptId: ride.attemptId }), { code: 'functions/failed-precondition' });
  await assert.rejects(getDoc(doc(outsider.db, `chats/${ride.chatId}`)), { code: 'permission-denied' });
  await assert.rejects(getDoc(doc(outsider.db, `rideRequests/${ride.id}`)), { code: 'permission-denied' });
  await assert.rejects(setDoc(doc(rider.db, `rideRequests/${ride.id}`), { status: 'CANCELLED' }, { merge: true }), { code: 'permission-denied' });
  const response = await fetch(`http://${functionsHost}/demo-seawolf-rides/us-central1/cancelAcceptedRide`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { requestId: ride.id, reason: 'No auth' } }),
  });
  assert.equal((await response.json()).error.status, 'PERMISSION_DENIED');
  assert.equal((await read(ride)).status, 'ACCEPTED');
});

test('completed, settled and pending rides retain their records and reservations', async () => {
  const past = Math.floor(Date.now() / 1000) - 1;
  for (const change of [{ status: 'PENDING' }, { status: 'DECLINED' }, { settledAt: past },
    { plan: { departure: past - 2000, pickup: past - 1000, vehicleCampusArrival: past, riderDestinationArrival: past } }]) {
    const ride = await seed(change);
    await assert.rejects(cancel(rider, ride), { code: 'functions/failed-precondition' });
    assert.equal((await read(ride)).cancellation, undefined);
    assert.ok((await Promise.all(ride.refs.map((ref) => ref.get()))).every((s) => s.exists));
  }
  const markerOnly = await seed();
  await db.doc(`_settledRequests/${markerOnly.id}`).set({ settlementId: 'paid' });
  await assert.rejects(cancel(driver, markerOnly), { code: 'functions/failed-precondition' });
});

test('a stale cancellation cannot touch a resent proposal or delete another ride’s reservation', async () => {
  const ride = await seed();
  await cancel(rider, ride);
  const reopened = { ...ride, status: 'ACCEPTED', attemptId: 'new-cancellation-attempt', cancellation: undefined };
  await db.doc(`rideRequests/${ride.id}`).update({ status: 'ACCEPTED', attemptId: reopened.attemptId });
  for (const ref of ride.refs) await ref.set({ requestId: ride.id });
  await assert.rejects(cancel(rider, ride), { code: 'functions/aborted' });
  assert.equal((await read(ride)).status, 'ACCEPTED');
  const before = (await db.doc(`chats/${ride.chatId}`).get()).data().messageCount;
  await ride.refs[0].set({ requestId: 'different-ride' });
  await assert.rejects(cancel(driver, reopened), { code: 'functions/failed-precondition' });
  assert.equal((await ride.refs[0].get()).get('requestId'), 'different-ride');
  assert.equal((await read(ride)).status, 'ACCEPTED');
  assert.equal((await db.doc(`chats/${ride.chatId}`).get()).data().messageCount, before);
});

test('simultaneous participants cancel once without duplicating messages or overwriting the first reason', async () => {
  const ride = await seed();
  const before = (await db.doc(`chats/${ride.chatId}`).get()).data().messageCount;
  await Promise.all([cancel(driver, ride, 'Driver reason'), cancel(rider, ride, 'Rider reason')]);
  const value = await read(ride);
  assert.equal(value.status, 'CANCELLED');
  assert.ok(['Driver reason', 'Rider reason'].includes(value.cancellation.reason));
  await cancel(rider, ride, 'Retried reason');
  assert.deepEqual((await read(ride)).cancellation, value.cancellation);
  assert.equal((await db.doc(`chats/${ride.chatId}`).get()).data().messageCount, before + 1);
});

test('cancellation and price approval cannot leave an active price proposal on a cancelled ride', async () => {
  const unanswered = await seed();
  const proposal = { requestId: unanswered.id, proposalId: 'cancellation-expire-001', cents: 350, expectedCents: 300 };
  await driver.call('proposeRidePriceChange', proposal);
  await cancel(rider, unanswered);
  assert.equal((await read(unanswered)).priceChange.status, 'EXPIRED');
  assert.equal((await driver.call('proposeRidePriceChange', proposal)).status, 'EXPIRED');
  const ride = await seed();
  await driver.call('proposeRidePriceChange', { requestId: ride.id, proposalId: 'cancellation-price-001', cents: 350, expectedCents: 300 });
  const [cancelled] = await Promise.allSettled([
    cancel(rider, ride),
    rider.call('respondToRidePriceChange', { requestId: ride.id, proposalId: 'cancellation-price-001', decision: 'ACCEPTED' }),
  ]);
  assert.equal(cancelled.status, 'fulfilled');
  const value = await read(ride);
  assert.equal(value.status, 'CANCELLED');
  assert.notEqual(value.priceChange.status, 'PENDING');
  await assert.rejects(driver.call('proposeRidePriceChange', { requestId: ride.id, proposalId: 'cancellation-price-002', cents: 250, expectedCents: value.price.cents }), { code: 'functions/failed-precondition' });
});

test('legacy confirmed rides without proposal IDs or chat threads can cancel and create a participant-only notice', async () => {
  // Use another pair so their shared conversation does not already exist.
  const legacyDriver = await client('cancellation-legacy-driver');
  const ride = await seed({ driverId: legacyDriver.uid, participantIds: [rider.uid, legacyDriver.uid] }, { commitments: false });
  const ref = db.doc(`rideRequests/${ride.id}`);
  const { FieldValue } = require('firebase-admin/firestore');
  await ref.update({ attemptId: FieldValue.delete() });
  delete ride.attemptId;
  await cancel(legacyDriver, ride, 'Car unavailable');
  const thread = await getDoc(doc(rider.db, `chats/${chatIdFor(legacyDriver.uid, rider.uid)}`));
  assert.match(thread.data().lastMessage, /Car unavailable/);
});

test('released reservations permit the actual acceptance transaction for another ride on the same date', async () => {
  const old = await seed();
  const weekday = weekdayForDate(old.localDate);
  await saveMatchingFixture(driver, 'driver', weekday);
  await saveMatchingFixture(outsider, 'rider', weekday);
  const { refs: _refs, chatId: _chatId, ...record } = old;
  const id = requestIdFor(outsider.uid, driver.uid, old.localDate);
  const pending = { ...record, id, riderId: outsider.uid, riderName: 'Other rider',
    initiatorId: outsider.uid, participantIds: [outsider.uid, driver.uid], status: 'PENDING',
    riderRevision: 'v1', driverRevision: 'v1', attemptId: 'replacement-attempt-0001' };
  await db.doc(`rideRequests/${id}`).set(pending);
  const snapshots = await db.getAll(...[outsider.uid, driver.uid].flatMap((uid) => [
    db.doc(`matchingSetups/${uid}`), db.doc(`users/${uid}`), db.doc(`users/${uid}/commutes/primary`),
  ]));
  const { id: _id, status: _status, createdAt: _createdAt, updatedAt: _updatedAt, ...value } = pending;
  const prepared = { value, snapshots };
  await assert.rejects(commitAcceptance(id, driver.uid, prepared, pending.attemptId), { code: 'failed-precondition' });
  await cancel(rider, old);
  assert.equal((await commitAcceptance(id, driver.uid, prepared, pending.attemptId)).status, 'ACCEPTED');
  for (const uid of [driver.uid, outsider.uid])
    assert.equal((await db.doc(`_rideCommitments/${commitmentIdFor(uid, old.localDate)}`).get()).get('requestId'), id);
  await cancel(rider, old); // late retry must not delete the replacement ride’s reservation
  assert.equal((await old.refs[0].get()).get('requestId'), id);
});
