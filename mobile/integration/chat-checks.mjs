import { httpsCallable } from 'firebase/functions';
import assert from 'node:assert/strict';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';

function delivered(account, chatId, count) {
  return new Promise((resolve, reject) => {
    let stop;
    const timer = setTimeout(() => { stop?.(); reject(new Error('Chat delivery did not arrive')); }, 10000);
    stop = onSnapshot(query(collection(account.db, 'chats', chatId, 'messages'), orderBy('sequence')), (snapshot) => {
      if (snapshot.size >= count) { clearTimeout(timer); stop?.(); resolve(snapshot.docs.map((d) => d.data())); }
    }, (error) => { clearTimeout(timer); stop?.(); reject(error); });
  });
}
export async function verifyChat(t, { driver, rider, outsider, match, date, action, db, calls }) {
  let chatId;
  const input = { driverId: driver.uid, riderId: rider.uid, localDate: date,
    driverRevision: match.driverRevision, riderRevision: match.riderRevision };
  await t.test('real potential matches can chat before requesting, without exposing pickup or reserving a seat', async () => {
    await assert.rejects(action(outsider, 'startMatchChat', input), { code: 'functions/permission-denied' });
    await assert.rejects(action(rider, 'startMatchChat', { ...input, driverId: rider.uid }), { code: 'functions/invalid-argument' });
    await assert.rejects(action(rider, 'startMatchChat', { ...input, driverRevision: '0'.repeat(64) }), { code: 'functions/failed-precondition' });
    await assert.rejects(action(rider, 'startMatchChat', { ...input, driverId: outsider.uid }), { code: 'functions/failed-precondition' });
    await assert.rejects(action(rider, 'startMatchChat', { ...input,
      driverId: rider.uid, riderId: driver.uid, driverRevision: match.riderRevision, riderRevision: match.driverRevision,
    }), { code: 'functions/failed-precondition' });
    const before = calls.length;
    const [a, b] = await Promise.all([action(rider, 'startMatchChat', input), action(driver, 'startMatchChat', input)]);
    chatId = a.id;
    assert.equal(a.id, b.id, 'opposite initiators must reuse the same conversation');
    assert.equal(calls.length, before, 'new chat revalidates through the shared cached matching routes');
    await assert.rejects(action(outsider, 'getChatMatch', { chatId: a.id }), { code: 'functions/permission-denied' });
    await assert.rejects(action(rider, 'getChatMatch', { chatId: a.id, driverId: outsider.uid }), { code: 'functions/invalid-argument' });
    const driverDetails = await action(driver, 'getChatMatch', { chatId: a.id });
    const riderDetails = await action(rider, 'getChatMatch', { chatId: a.id });
    assert.equal(driverDetails.match.role, 'rider');
    assert.equal(riderDetails.match.role, 'driver');
    for (const [account, result, other] of [[driver, driverDetails, rider], [rider, riderDetails, driver]]) {
      const own = (await db.doc(`users/${account.uid}/commutes/primary`).get()).data();
      const peer = (await db.doc(`users/${other.uid}/commutes/primary`).get()).data();
      assert.deepEqual(Object.keys(result).sort(), ['localDate', 'match', 'ownPoint']);
      assert.deepEqual(result.ownPoint, own.startPoint);
      assert.deepEqual(result.match.area, peer.startArea);
      assert.equal(result.match.name, other.uid);
      assert.equal(result.match.plan.departure, match.plan.departure);
      assert.equal(result.match.riderPickup, undefined);
      assert.equal(result.match.driverStart, undefined);
    }
    await db.doc('_m3Routing/publicOsrm').update({ owner: 'held-by-chat-test' });
    await assert.rejects(httpsCallable(rider.functions, 'getChatMatch')({ chatId: a.id }), { code: 'functions/resource-exhausted' });
    await db.doc('_m3Routing/publicOsrm').update({ owner: null });
    const commuteRef = db.doc(`users/${driver.uid}/commutes/primary`);
    await commuteRef.update({ discoveryEnabled: false });
    await assert.rejects(action(rider, 'getChatMatch', { chatId: a.id }), { code: 'functions/failed-precondition' });
    await commuteRef.update({ discoveryEnabled: true });
    const fresh = await action(rider, 'getChatMatch', { chatId: a.id });
    assert.notEqual(fresh.match.driverRevision, match.driverRevision, 'review uses current saved revisions');
    const thread = (await getDoc(doc(driver.db, 'chats', a.id))).data();
    assert.deepEqual(thread.participantIds, [driver.uid, rider.uid].sort());
    assert.equal(thread.names[rider.uid], rider.uid);
    assert.equal(thread.messageCount, 0);
    assert.equal(thread.requestId, undefined);
    assert.equal(thread.trip.pickup, match.plan.pickup);
    assert.equal(thread.trip.vehicleCampusArrival, match.plan.vehicleCampusArrival);
    assert.equal((await getDocs(collection(rider.db, 'chats', a.id, 'messages'))).size, 0, 'empty prompt is not a stored message');
    assert.equal(thread.driverStart, undefined);
    assert.equal(thread.riderPickup, undefined);
    assert.equal(thread.startPoint, undefined);
    assert.equal((await db.collection('rideRequests').get()).size, 0);
    assert.equal((await db.collection('_rideCommitments').get()).size, 0);
    assert.equal((await db.collection('ridePickups').get()).size, 0);
    await assert.rejects(getDoc(doc(outsider.db, 'chats', a.id)), { code: 'permission-denied' });
    await assert.rejects(getDocs(collection(outsider.db, 'chats')), { code: 'permission-denied' });
    await assert.rejects(setDoc(doc(rider.db, 'chats', a.id), { participantIds: [rider.uid, outsider.uid] }), { code: 'permission-denied' });
    for (const bad of ['', '   ', 'x'.repeat(2001)])
      await assert.rejects(action(rider, 'sendChatMessage', { chatId: a.id, messageId: 'chat-message-invalid', text: bad }), { code: 'functions/invalid-argument' });
    await assert.rejects(action(outsider, 'sendChatMessage', { chatId: a.id, messageId: 'chat-outsider-message', text: 'No access' }), { code: 'functions/permission-denied' });
    const updates = [driver, rider].map((account) => delivered(account, a.id, 2));
    const send = (account, messageId, text) => action(account, 'sendChatMessage', { chatId: a.id, messageId, text });
    await Promise.all([send(rider, 'chat-rider-message-1', 'Can we coordinate pickup?'), send(driver, 'chat-driver-message-1', 'Yes, let’s discuss.')]);
    for (const messages of await Promise.all(updates)) {
      assert.deepEqual(messages.map((m) => m.sequence), [1, 2]);
      assert.deepEqual(new Set(messages.map((m) => m.senderId)), new Set([driver.uid, rider.uid]));
    }
    await Promise.all([send(rider, 'chat-rider-message-2', 'Thanks!'), send(rider, 'chat-rider-message-2', 'Thanks!')]);
    assert.equal((await getDocs(collection(rider.db, 'chats', a.id, 'messages'))).size, 3);
    assert.equal((await getDoc(doc(driver.db, 'chats', a.id))).data().messageCount, 3);
    await assert.rejects(send(rider, 'chat-rider-message-2', 'Changed payload'), { code: 'functions/aborted' });
    await assert.rejects(send(driver, 'chat-rider-message-2', 'Thanks!'), { code: 'functions/aborted' });
    await assert.rejects(action(rider, 'sendChatMessage', { chatId: a.id, messageId: 'chat-forged-sender-1', text: 'Forged', senderId: driver.uid }), { code: 'functions/invalid-argument' });
    await assert.rejects(setDoc(doc(rider.db, 'chats', a.id, 'messages', 'direct'), { senderId: driver.uid, text: 'Forged' }), { code: 'permission-denied' });
    await assert.rejects(getDocs(collection(outsider.db, 'chats', a.id, 'messages')), { code: 'permission-denied' });
    for (const account of [driver, rider]) {
      const inbox = await getDocs(query(collection(account.db, 'chats'), where('participantIds', 'array-contains', account.uid)));
      assert.ok(inbox.docs.some((d) => d.id === a.id && d.data().lastMessage === 'Thanks!'));
    }
    assert.equal(calls.length, before, 'sending messages must not call a router');
  });
  return chatId;
}

/** A request is enough to create a shared Inbox entry, even before the first text. */
export async function verifyRequestChat({ driver, rider, outsider, value, count = 0, status = 'PENDING' }) {
  assert.match(value.chatId, /^[a-f0-9]{64}$/);
  for (const account of [driver, rider]) {
    const thread = (await getDoc(doc(account.db, 'chats', value.chatId))).data();
    assert.equal(thread.requestId, value.id);
    assert.equal(thread.messageCount, count, 'linking a request must preserve actual messages');
    assert.deepEqual(thread.participantIds, [driver.uid, rider.uid].sort());
    const request = (await getDoc(doc(account.db, 'rideRequests', thread.requestId))).data();
    assert.equal(request.status, status, 'context reads the current shared request status');
    assert.deepEqual(thread.trip, { driverId: request.driverId, riderId: request.riderId,
      localDate: request.localDate, campusLabel: request.campusLabel,
      departure: request.plan.departure, pickup: request.plan.pickup,
      vehicleCampusArrival: request.plan.vehicleCampusArrival });
    const inbox = await getDocs(query(collection(account.db, 'chats'), where('participantIds', 'array-contains', account.uid)));
    assert.ok(inbox.docs.some((d) => d.id === value.chatId));
    const messages = await getDocs(collection(account.db, 'chats', value.chatId, 'messages'));
    assert.equal(messages.size, count, 'never insert automatic request/placeholder text');
  }
  if (outsider) await assert.rejects(getDoc(doc(outsider.db, 'chats', value.chatId)), { code: 'permission-denied' });
}
