import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { areUsersMutuallyBlocked, loadCalendarParticipant, prepareCalendarPair, requireLocalDemo } from './calendarMatching';
import { checkDemoDate } from '../../mobile/src/calendar/commuteCalendar';
import { eligible, withMatchingRouting } from './matchingRuntime';
import { DemoBusyError } from './demoRouting';
import { chatIdFor, chatTrip } from './chatThreads';
import type { ChatMatchDetails } from '../../mobile/src/chat/chatModel';
import { ARRIVAL_BUFFER_SECONDS } from '../../mobile/src/commute/arrivalPolicy';
import { localMinuteToEpoch, CAMPUS_POINTS, record } from '../../mobile/src/mvp/settings';

const options = { region: 'us-central1', timeoutSeconds: 120, maxInstances: 1, concurrency: 4 };
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function authenticated(uid?: string) {
  requireLocalDemo();
  if (!uid || !(await eligible(uid)))
    throw new HttpsError('permission-denied', 'Sign in with a verified campus account.');
  return uid;
}
function mapped(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof DemoBusyError) throw new HttpsError('resource-exhausted', error.message);
  throw new HttpsError('unavailable', 'Chat is unavailable. Please retry.');
}
/** A conversation is one pair of people, independent of date or Either arrangement. */
export const startMatchChat = onCall(options, async (call) => {
  try {
    const uid = await authenticated(call.auth?.uid);
    const data = call.data;
    if (!record(data) || Object.keys(data).sort().join(',') !== 'driverId,driverRevision,localDate,riderId,riderRevision' ||
        !identity(data.driverId) || !identity(data.riderId) || data.driverId === data.riderId ||
        !hash(data.driverRevision) || !hash(data.riderRevision) || typeof data.localDate !== 'string')
      throw new HttpsError('invalid-argument', 'Choose a current potential match.');
    if (uid !== data.driverId && uid !== data.riderId)
      throw new HttpsError('permission-denied', 'You must be one of the matched participants.');
    const { driverId, riderId, localDate, riderRevision, driverRevision } = data;
    const otherId = uid === driverId ? riderId : driverId;
    if (!(await eligible(otherId))) throw new HttpsError('permission-denied', 'This account is unavailable.');
    if (await areUsersMutuallyBlocked(uid, otherId)) throw new HttpsError('permission-denied', 'You cannot message a blocked commuter.');
    const participants = [data.driverId, data.riderId].sort();
    const id = chatIdFor(driverId, riderId);
    const db = getFirestore();
    const ref = db.doc(`chats/${id}`);
    // Existing conversations remain available even after plans change; no repeat routing.
    if ((await ref.get()).exists) return { id };
    try { checkDemoDate(data.localDate, Math.floor(Date.now() / 1000)); }
    catch { throw new HttpsError('invalid-argument', 'Choose a date within the next 30 days.'); }
    const prepared = await withMatchingRouting((routing) => prepareCalendarPair(
      riderId, driverId, localDate, riderRevision, driverRevision, routing,
    ), true);
    await db.runTransaction(async (tx) => {
      const [existing, ...current] = await tx.getAll(ref, ...prepared.snapshots.map((s) => s.ref));
      if (existing.exists) return;
      if (current.some((snapshot, i) => snapshot.exists !== prepared.snapshots[i].exists ||
          (snapshot.exists && !snapshot.updateTime!.isEqual(prepared.snapshots[i].updateTime!))))
        throw new HttpsError('aborted', 'The commute changed. Search again before starting a chat.');
      const time = Date.now();
      tx.create(ref, {
        schemaVersion: 1, participantIds: participants,
        names: { [driverId]: prepared.value.driverName, [riderId]: prepared.value.riderName },
        localDate: data.localDate, campusLabel: prepared.value.campusLabel, trip: chatTrip(prepared.value),
        createdAt: time, updatedAt: time, messageCount: 0, lastMessage: '',
      });
    });
    return { id };
  } catch (error) { mapped(error); }
});

export const sendChatMessage = onCall(options, async (call) => {
  try {
    const uid = await authenticated(call.auth?.uid);
    const data = call.data;
    if (!record(data) || Object.keys(data).sort().join(',') !== 'chatId,messageId,text' || !hash(data.chatId) ||
        typeof data.messageId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.messageId) ||
        typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000)
      throw new HttpsError('invalid-argument', 'Send a message of 1–2,000 characters.');
    const { chatId, messageId } = data;
    const text = data.text.trim();
    const db = getFirestore();
    const ref = db.doc(`chats/${chatId}`);
    const before = (await ref.get()).data();
    if (!before?.participantIds?.includes(uid))
      throw new HttpsError('permission-denied', 'This conversation is not available to your account.');
    if ((await Promise.all(before.participantIds.map((id: string) => eligible(id)))).some((ok) => !ok))
      throw new HttpsError('permission-denied', 'Both accounts must remain eligible to chat.');
    const otherParticipant = before.participantIds.find((id: string) => id !== uid);
    if (otherParticipant && (await areUsersMutuallyBlocked(uid, otherParticipant)))
      throw new HttpsError('permission-denied', 'You cannot message a blocked commuter.');
    return await db.runTransaction(async (tx) => {
      const message = ref.collection('messages').doc(messageId);
      const [thread, existing] = await tx.getAll(ref, message);
      const value = thread.data();
      if (!value?.participantIds?.includes(uid))
        throw new HttpsError('permission-denied', 'This conversation is not available to your account.');
      if (existing.exists) {
        if (existing.get('senderId') !== uid || existing.get('text') !== text)
          throw new HttpsError('aborted', 'This message identifier was already used.');
        return { id: message.id };
      }
      const sequence = value.messageCount + 1;
      if (!Number.isSafeInteger(sequence) || sequence < 1)
        throw new HttpsError('failed-precondition', 'This conversation needs recovery.');
      const sentAt = Date.now();
      tx.create(message, { senderId: uid, text: text, sentAt, sequence });
      tx.update(ref, { updatedAt: sentAt, lastMessage: text, messageCount: sequence });
      return { id: message.id };
    });
  } catch (error) { mapped(error); }
});

/** Refresh just this inquiry's canonical pair, never scan the whole candidate list. */
export const getChatMatch = onCall(options, async (call): Promise<ChatMatchDetails> => {
  try {
    const uid = await authenticated(call.auth?.uid);
    const data = call.data;
    if (!record(data) || Object.keys(data).join(',') !== 'chatId' || !hash(data.chatId))
      throw new HttpsError('invalid-argument', 'Choose a conversation.');
    const ref = getFirestore().doc(`chats/${data.chatId}`);
    const before = await ref.get();
    const thread = before.data();
    if (!thread?.participantIds?.includes(uid))
      throw new HttpsError('permission-denied', 'This conversation is unavailable to your account.');
    const trip = thread.trip;
    if (!trip || !identity(trip.driverId) || !identity(trip.riderId) ||
        chatIdFor(trip.driverId, trip.riderId) !== data.chatId || typeof trip.localDate !== 'string')
      throw new HttpsError('failed-precondition', 'Find a current match from your calendar to start a new trip.');
    const [driver, rider] = await Promise.all([
      loadCalendarParticipant(trip.driverId, trip.localDate, undefined, trip.direction), loadCalendarParticipant(trip.riderId, trip.localDate, undefined, trip.direction),
    ]);
    if (!driver || !rider) throw new HttpsError('failed-precondition', 'This match is no longer available.');
    const prepared = await withMatchingRouting((routing) => prepareCalendarPair(
      trip.riderId, trip.driverId, trip.localDate, rider.participant.revision, driver.participant.revision, routing, trip.direction,
    ), true);
    // Recheck after routing; a changed inquiry or saved plan must not be displayed as current.
    const [freshThread, ...current] = await getFirestore().getAll(ref, ...prepared.snapshots.map((s) => s.ref));
    if (JSON.stringify(freshThread.get('trip')) !== JSON.stringify(trip) || freshThread.get('requestId') !== thread.requestId ||
        current.some((s, i) => s.exists !== prepared.snapshots[i].exists ||
          (s.exists && !s.updateTime!.isEqual(prepared.snapshots[i].updateTime!))))
      throw new HttpsError('aborted', 'The trip changed. Reopen its details.');
    const d = prepared.participants.driver, r = prepared.participants.rider;
    const own = uid === d.uid ? d : r, other = uid === d.uid ? r : d;
    const dropoffLabel = prepared.value.campusLabel;
    const preferredDropoffLabel = r.commute.riderDropoffPreference === 'any' || r.commute.campusLot === 'other'
      ? 'Any' : CAMPUS_POINTS.find((p) => p.id === r.commute.campusLot)?.label;
    return { localDate: trip.localDate, ownPoint: own.commute.startPoint!, match: {
      driverId: d.uid, riderId: r.uid, driverRevision: d.revision, riderRevision: r.revision,
      name: other.name, role: uid === d.uid ? 'rider' : 'driver', area: other.commute.startArea,
      plan: prepared.value.plan, metrics: prepared.value.metrics, price: prepared.value.price,
      addedDrivingSeconds: prepared.value.metrics.driverExtraDurationSeconds,
      arrivalDifferenceSeconds: Math.abs((uid === d.uid ? prepared.value.plan.vehicleCampusArrival : prepared.value.plan.riderDestinationArrival) - (localMinuteToEpoch(trip.localDate, own.day.arriveBy!) - ARRIVAL_BUFFER_SECONDS)),
      savedDriverDeparture: localMinuteToEpoch(trip.localDate, d.day.startAt!),
      dropoffLabel, preferredDropoffLabel, dropoffPreferenceMatch: preferredDropoffLabel === 'Any' || preferredDropoffLabel === dropoffLabel,
      ...(prepared.eta ? { eta: prepared.eta } : {}),
    } };
  } catch (error) { mapped(error); }
});
