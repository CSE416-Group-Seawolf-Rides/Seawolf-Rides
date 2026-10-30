import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { eligible } from './matchingRuntime';
import { requireLocalDemo } from './calendarMatching';
import { rideHasFinished } from '../../mobile/src/payments/rideCompletion';
import { agreedPrice, validProposedPrice, type PriceChangeRequest } from '../../mobile/src/payments/priceChanges';
import type { RideRequest } from '../../mobile/src/mvp/rideRequestModel';
import { appendChatEntries, chatIdFor, priceEntry, readRideChatEntries, updateRideChatEntries } from './chatThreads';
import {
  applyAdjustment,
  DEFAULT_FUEL_PRICES,
  EFFICIENCY_LIMITS,
  isPriceAdjustment,
  parseRidePrice,
  ridePrice,
  vehicleEfficiencyFrom,
  type FuelPrices,
  type FuelType,
  type PriceAdjustment,
  type PriceMetrics,
  type RidePrice,
} from '../../mobile/src/payments/pricing';
import {
  eiaWeeklyGasUrl,
  FUEL_PRICES_DOC,
  parseEiaLatestGas,
  parseFuelPrices,
} from '../../mobile/src/payments/fuelPrices';
import {
  normalizeHandle,
  parsePaymentHandles,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../mobile/src/payments/paymentHandles';

const now = () => Math.floor(Date.now() / 1000);
const options = { region: 'us-central1' } as const;

async function requireUser(call: { auth?: { uid: string } }): Promise<string> {
  requireLocalDemo();
  if (!call.auth || !(await eligible(call.auth.uid)))
    throw new HttpsError('permission-denied', 'Sign in with a verified Stony Brook account.');
  return call.auth.uid;
}

function onlyKeys(data: unknown, keys: string[]): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Object.keys(data).some((key) => !keys.includes(key)))
    throw new HttpsError('invalid-argument', 'Unexpected fields.');
  return data as Record<string, unknown>;
}

// ---- Pricing inputs ----------------------------------------------------------------

export async function loadFuelPrices(): Promise<FuelPrices> {
  const snapshot = await getFirestore().doc(FUEL_PRICES_DOC).get();
  return snapshot.exists ? parseFuelPrices(snapshot.data()) : DEFAULT_FUEL_PRICES;
}

export const adjustmentPath = (driverId: string, riderId: string) =>
  `priceAdjustments/${driverId}_${riderId}`;

async function loadAdjustment(driverId: string, riderId: string): Promise<PriceAdjustment | undefined> {
  const value = (await getFirestore().doc(adjustmentPath(driverId, riderId)).get()).data()?.adjustment;
  return isPriceAdjustment(value) && value !== 0 ? value : undefined;
}

// Prices a pair from the driver's car plus that driver's adjustment for this rider. Reads are
// cached per call so a search page costs one vehicle read per driver.
export function pricer(prices: FuelPrices) {
  const vehicles = new Map<string, Promise<unknown>>();
  return async (driverId: string, riderId: string, metrics: PriceMetrics): Promise<RidePrice> => {
    if (!vehicles.has(driverId))
      vehicles.set(
        driverId,
        getFirestore()
          .doc(`users/${driverId}/vehicles/primary`)
          .get()
          .then((snapshot) => snapshot.data()),
      );
    const [vehicle, adjustment] = await Promise.all([
      vehicles.get(driverId),
      loadAdjustment(driverId, riderId),
    ]);
    return applyAdjustment(ridePrice(metrics, vehicleEfficiencyFrom(vehicle), prices), adjustment);
  };
}

// Weekly: NY regular gas from EIA. Without a key the published defaults keep working.
export async function refreshFuelPricesNow(apiKey = process.env.EIA_API_KEY) {
  if (!apiKey) return { updated: false, reason: 'EIA_API_KEY is not set; using defaults.' };
  const response = await fetch(eiaWeeklyGasUrl(apiKey), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`EIA responded ${response.status}.`);
  const gas = parseEiaLatestGas(await response.json());
  const current = await loadFuelPrices();
  await getFirestore().doc(FUEL_PRICES_DOC).set({
    gasUsdPerGallon: gas.usdPerGallon,
    electricityUsdPerKwh: current.electricityUsdPerKwh,
    gasWeekOf: gas.weekOf,
    source: 'EIA',
    updatedAt: new Date(),
  });
  return { updated: true, weekOf: gas.weekOf };
}

// EIA publishes Monday afternoons Eastern; refresh Tuesday morning to be safe.
export const refreshFuelPrices = onSchedule(
  { schedule: 'every tuesday 06:00', timeZone: 'America/New_York', region: 'us-central1' },
  async () => {
    await refreshFuelPricesNow();
  },
);

// ---- Driver settings ---------------------------------------------------------------

export const saveFuelEfficiency = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['fuelType', 'efficiency']);
  const fuelType = String(data.fuelType) as FuelType;
  if (!['gas', 'hybrid', 'electric'].includes(fuelType))
    throw new HttpsError('invalid-argument', 'Choose gas, hybrid, or electric.');
  const limits = EFFICIENCY_LIMITS[fuelType];
  if (
    data.efficiency !== null &&
    (typeof data.efficiency !== 'number' ||
      !Number.isFinite(data.efficiency) ||
      data.efficiency < limits.min ||
      data.efficiency > limits.max)
  )
    throw new HttpsError(
      'invalid-argument',
      `Fuel efficiency must be ${limits.min}–${limits.max} ${limits.unit}.`,
    );
  const ref = getFirestore().doc(`users/${uid}/vehicles/primary`);
  const existing = (await ref.get()).data() ?? {};
  const { efficiency: _previous, ...rest } = existing as Record<string, unknown>;
  // null means "use the typical value for this fuel type".
  await ref.set({
    ...rest,
    ownerId: uid,
    schemaVersion: 1,
    fuelType,
    ...(typeof data.efficiency === 'number' ? { efficiency: Math.round(data.efficiency * 10) / 10 } : {}),
    updatedAt: new Date(),
  });
  return { saved: true };
});

export const savePaymentHandles = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, PAYMENT_METHODS);
  const handles: Record<string, string> = {};
  for (const method of PAYMENT_METHODS) {
    if (data[method] === undefined || data[method] === '') continue;
    if (typeof data[method] !== 'string')
      throw new HttpsError('invalid-argument', 'Check your payment usernames.');
    const normalized = normalizeHandle(method, data[method] as string);
    if (normalized.error) throw new HttpsError('invalid-argument', normalized.error);
    if (normalized.value) handles[method] = normalized.value;
  }
  await getFirestore().doc(`paymentHandles/${uid}`).set({ ...handles, updatedAt: new Date() });
  return { saved: true };
});

// ---- Driver adjusts or waives a rider's price --------------------------------------

// Future-request preference only. Existing quotes require the other participant's
// explicit approval through proposeRidePriceChange/respondToRidePriceChange.
export const setPriceAdjustment = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['riderId', 'adjustment']);
  if (typeof data.riderId !== 'string' || data.riderId === uid || !isPriceAdjustment(data.adjustment))
    throw new HttpsError('invalid-argument', 'Choose a rider and one of the price options.');
  const riderId = data.riderId;
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const rides = await tx.get(db.collection('rideRequests').where('participantIds', 'array-contains', uid));
    if (!rides.docs.some((doc) => doc.get('driverId') === uid && doc.get('riderId') === riderId))
      throw new HttpsError('permission-denied', 'Choose a rider you have a request with.');
    tx.set(db.doc(adjustmentPath(uid, riderId)), {
      participantIds: [uid, riderId], driverId: uid, riderId,
      adjustment: data.adjustment, updatedAt: now(),
    });
    return { adjustment: data.adjustment, lowered: 0 };
  });
});

// Price proposals live on the participant-protected ride document. They reuse the
// existing live ride subscription and server-only write rules, without a public inbox.
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const proposalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);
const priceAttemptPath = (requestId: string, id: string) =>
  `_priceChangeAttempts/${createHash('sha256').update(JSON.stringify([requestId, id])).digest('hex')}`;

export const proposeRidePriceChange = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['requestId', 'proposalId', 'cents', 'expectedCents']);
  if (!safeId(data.requestId) || !proposalId(data.proposalId) || !Number.isSafeInteger(data.expectedCents))
    throw new HttpsError('invalid-argument', 'Choose a ride and the amount you reviewed.');
  const db = getFirestore();
  const ref = db.doc(`rideRequests/${data.requestId}`);
  const operation = db.doc(priceAttemptPath(data.requestId, data.proposalId));
  return db.runTransaction(async (tx) => {
    const [snapshot, marker, attempt] = await tx.getAll(ref, db.doc(`_settledRequests/${data.requestId}`), operation);
    const ride = snapshot.data() as RideRequest | undefined;
    if (!ride || (ride.driverId !== uid && ride.riderId !== uid))
      throw new HttpsError('permission-denied', 'Only this ride’s driver or rider can propose a price.');
    const existing = ride.priceChange;
    if (attempt.exists) {
      const previous = attempt.data()!;
      if (previous.proposerId !== uid || previous.toCents !== data.cents || previous.fromCents !== data.expectedCents)
        throw new HttpsError('aborted', 'This proposal identifier was already used.');
      return { id: data.proposalId, status: previous.status };
    }
    if (existing && existing.id === data.proposalId) {
      if (existing.proposerId !== uid || existing.toCents !== data.cents || existing.fromCents !== data.expectedCents)
        throw new HttpsError('aborted', 'This proposal identifier was already used.');
      return { id: existing.id, status: existing.status };
    }
    const price = parseRidePrice(ride.price);
    if (ride.status !== 'ACCEPTED' || !price || marker.exists || ride.settledAt !== undefined)
      throw new HttpsError('failed-precondition', 'Only confirmed rides that haven’t been paid can change price.');
    if (existing?.status === 'PENDING')
      throw new HttpsError('failed-precondition', 'Reply to or cancel the pending price change first.');
    if (price.cents !== data.expectedCents)
      throw new HttpsError('aborted', 'The agreed price changed. Reopen the ride and review it.');
    if (!validProposedPrice(data.cents, price) || data.cents === price.cents)
      throw new HttpsError('invalid-argument', 'Choose a different price in $0.25 steps within this ride’s limit.');
    const timestamp = now();
    const change: PriceChangeRequest = {
      id: data.proposalId as string, proposerId: uid,
      recipientId: uid === ride.driverId ? ride.riderId : ride.driverId,
      fromCents: price.cents, toCents: data.cents, status: 'PENDING',
      createdAt: timestamp, updatedAt: timestamp,
    };
    const [thread, entries] = await Promise.all([
      tx.get(db.doc(`chats/${chatIdFor(ride.driverId, ride.riderId)}`)),
      readRideChatEntries(tx, { ...ride, id: snapshot.id }),
    ]);
    const proposed = { ...ride, id: snapshot.id, priceChange: change, updatedAt: timestamp };
    tx.create(operation, change);
    tx.update(ref, { priceChange: change, updatedAt: timestamp });
    updateRideChatEntries(tx, entries, proposed);
    appendChatEntries(tx, thread, proposed, [priceEntry(proposed, change)]);
    return { id: change.id, status: change.status };
  });
});

export const respondToRidePriceChange = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['requestId', 'proposalId', 'decision']);
  if (!safeId(data.requestId) || !proposalId(data.proposalId)
      || !['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(String(data.decision)))
    throw new HttpsError('invalid-argument', 'Choose a price change and a response.');
  const db = getFirestore();
  const ref = db.doc(`rideRequests/${data.requestId}`);
  return db.runTransaction(async (tx) => {
    const [snapshot, marker] = await tx.getAll(ref, db.doc(`_settledRequests/${data.requestId}`));
    const ride = snapshot.data() as RideRequest | undefined;
    const change = ride?.priceChange;
    if (!ride || (ride.driverId !== uid && ride.riderId !== uid) || !change)
      throw new HttpsError('permission-denied', 'This price change is unavailable to your account.');
    if (change.id !== data.proposalId)
      throw new HttpsError('aborted', 'This price change has been replaced. Review the current request.');
    if (uid !== (data.decision === 'CANCELLED' ? change.proposerId : change.recipientId))
      throw new HttpsError('permission-denied', 'Only the recipient can accept or reject; only the sender can cancel.');
    if (change.status === data.decision) return { status: change.status };
    if (change.status !== 'PENDING')
      throw new HttpsError('failed-precondition', 'This price change was already answered or expired.');
    const price = parseRidePrice(ride.price);
    if (ride.status !== 'ACCEPTED' || !price || marker.exists || ride.settledAt !== undefined)
      throw new HttpsError('failed-precondition', 'This ride is closed or already marked paid.');
    if (price.cents !== change.fromCents || !validProposedPrice(change.toCents, price))
      throw new HttpsError('aborted', 'The agreed price changed. Review a new proposal.');
    const timestamp = now();
    const entries = await readRideChatEntries(tx, { ...ride, id: snapshot.id });
    const answered: RideRequest = {
      ...ride, id: snapshot.id,
      priceChange: { ...change, status: data.decision as PriceChangeRequest['status'], updatedAt: timestamp },
      ...(data.decision === 'ACCEPTED' ? { price: agreedPrice(price, change.toCents) } : {}),
      updatedAt: timestamp,
    };
    tx.set(db.doc(priceAttemptPath(snapshot.id, change.id)), { ...change, status: data.decision, updatedAt: timestamp });
    tx.update(ref, {
      priceChange: { ...change, status: data.decision, updatedAt: timestamp },
      ...(data.decision === 'ACCEPTED' ? { price: agreedPrice(price, change.toCents) } : {}),
      updatedAt: timestamp,
    });
    updateRideChatEntries(tx, entries, answered);
    return { status: data.decision };
  });
});

// ---- Settling up -------------------------------------------------------------------

async function acceptedBetween(uid: string, otherId: string): Promise<RideRequest[]> {
  const snapshot = await getFirestore()
    .collection('rideRequests')
    .where('participantIds', 'array-contains', uid)
    .where('status', '==', 'ACCEPTED')
    .get();
  return snapshot.docs
    .map((doc) => ({ ...(doc.data() as RideRequest), id: doc.id }))
    .filter((r) => r.participantIds.includes(otherId));
}

// A rider sees a driver's payment usernames only after riding with them.
export const getPayeeHandles = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['payeeId']);
  if (typeof data.payeeId !== 'string' || data.payeeId === uid)
    throw new HttpsError('invalid-argument', 'Choose who to pay.');
  const rides = await acceptedBetween(uid, data.payeeId);
  if (!rides.some((r) => r.riderId === uid && r.driverId === data.payeeId))
    throw new HttpsError('permission-denied', 'You can only pay drivers you have ridden with.');
  const snapshot = await getFirestore().doc(`paymentHandles/${data.payeeId}`).get();
  return { handles: parsePaymentHandles(snapshot.data()) };
});

export const recordSettlement = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['payeeId', 'requestIds', 'method', 'expectedCents']);
  const method = data.method as PaymentMethod | 'other';
  if (
    typeof data.payeeId !== 'string' ||
    (data.expectedCents !== undefined && (!Number.isSafeInteger(data.expectedCents) || (data.expectedCents as number) < 0)) ||
    !(method === 'other' || PAYMENT_METHODS.includes(method)) ||
    !Array.isArray(data.requestIds) ||
    data.requestIds.length === 0 ||
    data.requestIds.length > 60 ||
    !data.requestIds.every((id) => typeof id === 'string') ||
    new Set(data.requestIds).size !== data.requestIds.length
  )
    throw new HttpsError('invalid-argument', 'Choose which rides you paid for.');
  const requestIds = data.requestIds as string[];
  const payeeId = data.payeeId;
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const refs = requestIds.map((id) => db.doc(`rideRequests/${id}`));
    const markers = requestIds.map((id) => db.doc(`_settledRequests/${id}`));
    const [requests, settled] = await Promise.all([tx.getAll(...refs), tx.getAll(...markers)]);
    let cents = 0;
    let payerName = '';
    let payeeName = '';
    requests.forEach((snapshot) => {
      const request = snapshot.data() as RideRequest | undefined;
      const price = parseRidePrice(request?.price);
      if (
        !request ||
        request.status !== 'ACCEPTED' ||
        request.riderId !== uid ||
        request.driverId !== payeeId ||
        !price ||
        !rideHasFinished(request, now())
      )
        throw new HttpsError('failed-precondition', 'Only rides you have taken with this driver can be settled.');
      cents += price.cents;
      payerName = request.riderName;
      payeeName = request.driverName;
    });
    if (data.expectedCents !== undefined && cents !== data.expectedCents)
      throw new HttpsError('aborted', 'The agreed amount changed. Reopen Settle up and review the new total.');
    if (settled.some((marker) => marker.exists))
      throw new HttpsError('already-exists', 'Some of these rides are already marked paid.');
    const chatEntries = await Promise.all(requests.map((snapshot) =>
      readRideChatEntries(tx, { ...snapshot.data(), id: snapshot.id } as RideRequest)));
    const ref = db.collection('settlements').doc();
    const timestamp = now();
    tx.create(ref, {
      schemaVersion: 1,
      participantIds: [uid, payeeId],
      payerId: uid,
      payeeId,
      payerName,
      payeeName,
      requestIds,
      cents,
      method,
      status: 'MARKED_PAID',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    markers.forEach((marker) => tx.create(marker, { settlementId: ref.id, createdAt: timestamp }));
    requests.forEach((snapshot, index) => {
      const ride = { ...snapshot.data(), id: snapshot.id } as RideRequest;
      const change = ride.priceChange;
      if (change?.status === 'PENDING')
        tx.set(db.doc(priceAttemptPath(snapshot.id, change.id)), { ...change, status: 'EXPIRED', updatedAt: timestamp });
      const update = {
        settledAt: timestamp,
        ...(change?.status === 'PENDING' ? { priceChange: { ...change, status: 'EXPIRED' as const, updatedAt: timestamp } } : {}),
        updatedAt: timestamp,
      };
      tx.update(snapshot.ref, update);
      updateRideChatEntries(tx, chatEntries[index], { ...ride, ...update });
    });
    return { id: ref.id, cents };
  });
});

export const confirmSettlement = onCall(options, async (call) => {
  const uid = await requireUser(call);
  const data = onlyKeys(call.data, ['settlementId']);
  if (typeof data.settlementId !== 'string')
    throw new HttpsError('invalid-argument', 'Choose a payment to confirm.');
  const ref = getFirestore().doc(`settlements/${data.settlementId}`);
  return getFirestore().runTransaction(async (tx) => {
    const settlement = (await tx.get(ref)).data();
    if (!settlement || settlement.payeeId !== uid)
      throw new HttpsError('permission-denied', 'Only the driver who was paid can confirm.');
    if (settlement.status === 'CONFIRMED') return { status: 'CONFIRMED' };
    tx.update(ref, { status: 'CONFIRMED', updatedAt: now() });
    return { status: 'CONFIRMED' };
  });
});
