import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, getDocs, collection, query, orderBy, setDoc, doc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { localDateAt, localMinuteToEpoch } from '../src/mvp/settings.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
if (!authHost?.startsWith('127.0.0.1:') || !firestoreHost?.startsWith('127.0.0.1:') || !functionsHost.startsWith('127.0.0.1:'))
  throw new Error('Loopback emulators required.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const { chatIdFor, linkRequestChat, rideEntryId, priceEntryId } = require('./lib/functions/src/chatThreads');
const { requestIdFor } = require('./lib/functions/src/rideRequests');
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
  return { uid, db: firestore, call: (name, data) => httpsCallable(functions, name)(data).then((r) => r.data) };
}
before(async () => {
  driver = await client('timeline-driver'); rider = await client('timeline-rider'); outsider = await client('timeline-outsider');
});
after(async () => { await Promise.all(apps.map(deleteApp)); await deleteAdmin(admin); });
function value(changes = {}) {
  const localDate = shiftDate(localDateAt(Date.now() / 1000), ++counter);
  const departure = localMinuteToEpoch(localDate, 450);
  return { id: requestIdFor(rider.uid, driver.uid, localDate), schemaVersion: 1,
    participantIds: [driver.uid, rider.uid], driverId: driver.uid, riderId: rider.uid,
    initiatorId: rider.uid, attemptId: `timeline-attempt-${counter}`, driverName: 'Alex', riderName: 'Maya',
    localDate, direction: 'TO_CAMPUS', status: 'ACCEPTED', riderRevision: 'r1', driverRevision: 'd1', seats: 1,
    pickupLabel: 'Station', campusLabel: 'West Side', metrics: { driverExtraDurationSeconds: 300 },
    plan: { departure, pickup: departure + 600, vehicleCampusArrival: departure + 1800, riderDestinationArrival: departure + 2100 },
    price: { cents: 300, baseCents: 100, suggestedCents: 300, riderMiles: 6, extraMiles: 1, costPerMile: .4, fuelType: 'gas', gasWeekOf: '2026-10-12' },
    createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000), ...changes };
}
async function insert(ride) {
  const threadRef = db.doc(`chats/${chatIdFor(ride.driverId, ride.riderId)}`);
  await db.runTransaction(async (tx) => {
    const thread = await tx.get(threadRef);
    tx.set(db.doc(`rideRequests/${ride.id}`), ride);
    linkRequestChat(tx, thread, ride, ride.id, ride);
  });
  return ride;
}
const entries = async (actor = rider, d = driver, r = rider) => (await getDocs(query(
  collection(actor.db, `chats/${chatIdFor(d.uid, r.uid)}/messages`), orderBy('sequence'),
))).docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
const send = (actor, id, text) => actor.call('sendChatMessage', { chatId: chatIdFor(driver.uid, rider.uid), messageId: id, text });

test('successive rides append between texts in one conversation, and retries preserve all earlier entries', async () => {
  const first = await insert(value());
  await send(rider, 'timeline-between-0001', 'Thanks for the ride!');
  const second = await insert(value());
  await send(driver, 'timeline-between-0002', 'See you next time.');
  for (const actor of [driver, rider]) {
    const all = await entries(actor);
    assert.deepEqual(all.map((entry) => entry.id), [rideEntryId(first), 'timeline-between-0001', rideEntryId(second), 'timeline-between-0002']);
    assert.equal(all[0].ride.localDate, first.localDate);
    assert.equal(all[2].ride.localDate, second.localDate);
    assert.equal(new Set(all.map((entry) => entry.sequence)).size, all.length);
  }
  await rider.call('createRideRequest', { driverId: driver.uid, localDate: first.localDate, direction: 'TO_CAMPUS', riderRevision: 'r1', driverRevision: 'd1', attemptId: first.attemptId });
  assert.equal((await entries()).length, 4);
  assert.equal((await db.doc(`chats/${chatIdFor(driver.uid, rider.uid)}`).get()).get('requestId'), second.id);
});

test('each price proposal has its own permanent card, permissioned controls, and unchanged chronological position', async () => {
  const ride = await insert(value());
  const propose = (actor, id, cents, expectedCents) => actor.call('proposeRidePriceChange', { requestId: ride.id, proposalId: id, cents, expectedCents });
  const respond = (actor, id, decision) => actor.call('respondToRidePriceChange', { requestId: ride.id, proposalId: id, decision });
  await propose(driver, 'timeline-price-first-01', 350, 300);
  const before = (await entries()).find((entry) => entry.id === priceEntryId(ride.id, 'timeline-price-first-01'));
  await send(rider, 'timeline-price-text-01', 'That works for me.');
  await assert.rejects(respond(driver, 'timeline-price-first-01', 'ACCEPTED'), { code: 'functions/permission-denied' });
  await assert.rejects(respond(outsider, 'timeline-price-first-01', 'ACCEPTED'), { code: 'functions/permission-denied' });
  await respond(rider, 'timeline-price-first-01', 'ACCEPTED');
  await propose(rider, 'timeline-price-second-1', 250, 350);
  await respond(driver, 'timeline-price-second-1', 'DECLINED');
  await propose(driver, 'timeline-price-third-01', 300, 350);
  await respond(driver, 'timeline-price-third-01', 'CANCELLED');
  await propose(driver, 'timeline-price-first-01', 350, 300); // durable delayed retry
  const all = await entries();
  const first = all.find((entry) => entry.id === before.id);
  assert.equal(first.sentAt, before.sentAt);
  assert.equal(first.sequence, before.sequence);
  assert.equal(first.priceChange.status, 'ACCEPTED');
  assert.equal(first.priceChange.fromCents, 300);
  assert.equal(first.priceChange.toCents, 350);
  assert.ok(all.findIndex((entry) => entry.id === first.id) < all.findIndex((entry) => entry.id === 'timeline-price-text-01'));
  const prices = all.filter((entry) => entry.type === 'PRICE_CHANGE' && entry.requestId === ride.id);
  assert.deepEqual(prices.map((entry) => entry.priceChange.status), ['ACCEPTED', 'DECLINED', 'CANCELLED']);
  assert.equal(all.find((entry) => entry.id === rideEntryId(ride)).ride.price.cents, 350);
});

test('resending a cancelled proposal keeps its old card and updates only the new attempt', async () => {
  const first = await insert(value({ status: 'PENDING' }));
  await rider.call('cancelRideRequest', { requestId: first.id, attemptId: first.attemptId });
  const second = await insert({ ...first, attemptId: 'timeline-replacement-01', status: 'PENDING' });
  await driver.call('respondToRideRequest', { requestId: second.id, attemptId: second.attemptId, decision: 'DECLINED' });
  await assert.rejects(rider.call('cancelRideRequest', { requestId: first.id, attemptId: first.attemptId }), { code: 'functions/aborted' });
  const cards = (await entries()).filter((entry) => entry.type === 'RIDE_REQUEST' && entry.requestId === first.id);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].ride.status, 'CANCELLED');
  assert.equal(cards[0].ride.attemptId, first.attemptId);
  assert.equal(cards[1].ride.status, 'DECLINED');
  assert.equal(cards[1].ride.attemptId, second.attemptId);
});

test('cancellation and payment expire only the appropriate pending proposal card', async () => {
  const ride = await insert(value());
  await driver.call('proposeRidePriceChange', { requestId: ride.id, proposalId: 'timeline-cancel-price-01', cents: 350, expectedCents: 300 });
  await rider.call('cancelAcceptedRide', { requestId: ride.id, attemptId: ride.attemptId, reason: 'Class cancelled' });
  let all = await entries();
  assert.equal(all.find((entry) => entry.id === rideEntryId(ride)).ride.status, 'CANCELLED');
  assert.equal(all.find((entry) => entry.id === priceEntryId(ride.id, 'timeline-cancel-price-01')).priceChange.status, 'EXPIRED');
  const past = Math.floor(Date.now() / 1000) - 100;
  const paid = await insert(value({ plan: { departure: past - 1800, pickup: past - 1200, vehicleCampusArrival: past - 10, riderDestinationArrival: past } }));
  await driver.call('proposeRidePriceChange', { requestId: paid.id, proposalId: 'timeline-paid-price-001', cents: 350, expectedCents: 300 });
  await rider.call('recordSettlement', { payeeId: driver.uid, requestIds: [paid.id], method: 'other' });
  all = await entries();
  assert.ok(all.find((entry) => entry.id === rideEntryId(paid)).ride.settledAt > 0);
  assert.equal(all.find((entry) => entry.id === priceEntryId(paid.id, 'timeline-paid-price-001')).priceChange.status, 'EXPIRED');
});

test('future price proposals in existing chats do not backfill old ride cards or rewrite text history', async () => {
  const d = await client('timeline-legacy-driver');
  const r = await client('timeline-legacy-rider');
  const chatId = chatIdFor(d.uid, r.uid);
  const ride = value({ driverId: d.uid, riderId: r.uid, participantIds: [d.uid, r.uid], initiatorId: r.uid });
  await db.doc(`rideRequests/${ride.id}`).set(ride);
  const thread = db.doc(`chats/${chatId}`);
  await thread.set({ participantIds: [d.uid, r.uid].sort(), names: { [d.uid]: 'Alex', [r.uid]: 'Maya' },
    requestId: ride.id, messageCount: 1, createdAt: 1, updatedAt: 2, lastMessage: 'Existing text' });
  const original = { senderId: r.uid, text: 'Existing text', sequence: 1, sentAt: 2 };
  await thread.collection('messages').doc('legacy-text').set(original);
  await d.call('proposeRidePriceChange', { requestId: ride.id, proposalId: 'future-legacy-price-01', cents: 350, expectedCents: 300 });
  const all = await entries(r, d, r);
  assert.deepEqual(all.map((entry) => entry.id), ['legacy-text', priceEntryId(ride.id, 'future-legacy-price-01')]);
  assert.deepEqual((await thread.collection('messages').doc('legacy-text').get()).data(), original);
  await assert.rejects(setDoc(doc(r.db, `chats/${chatId}/messages/forged-card`), { type: 'PRICE_CHANGE', ride }), { code: 'permission-denied' });
});

// The specific multi-request cancellation flow, observed by both participants.
test('cancelling the first of two pending requests updates only its card and appends exactly one notice', async () => {
  const first = await insert(value({ status: 'PENDING' }));
  await send(rider, 'two-pending-between-01', 'First request details');
  const second = await insert(value({ status: 'PENDING' }));
  const before = await entries();
  const a = before.find((entry) => entry.id === rideEntryId(first));
  const b = before.find((entry) => entry.id === rideEntryId(second));
  const beforeIds = before.map((entry) => entry.id);
  await Promise.all([
    rider.call('cancelRideRequest', { requestId: first.id, attemptId: first.attemptId }),
    rider.call('cancelRideRequest', { requestId: first.id, attemptId: first.attemptId }),
  ]);
  for (const actor of [driver, rider]) {
    const all = await entries(actor);
    const updated = all.find((entry) => entry.id === a.id);
    assert.deepEqual({ ...updated, ride: a.ride }, a, 'first card keeps its identity and position');
    assert.equal(updated.ride.status, 'CANCELLED');
    assert.deepEqual(all.find((entry) => entry.id === b.id), b, 'second card is untouched');
    assert.equal(b.ride.status, 'PENDING');
    assert.deepEqual(all.slice(0, -1).map((entry) => entry.id), beforeIds);
    assert.equal(all.at(-1).type, 'RIDE_CANCELLED');
    assert.equal(all.at(-1).requestId, first.id);
    assert.match(all.at(-1).text, /Maya cancelled the request/);
    assert.ok(all.at(-1).text.includes(first.localDate));
    assert.equal(all.length, before.length + 1);
  }
  assert.equal((await db.doc(`chats/${chatIdFor(driver.uid, rider.uid)}`).get()).get('requestId'), second.id);
});
