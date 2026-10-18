import assert from 'node:assert/strict';
import test from 'node:test';
import { chatContext } from '../src/chat/chatModel.ts';
const trip = { driverId: 'd', riderId: 'r', localDate: '2026-10-20', campusLabel: 'West Side', departure: 1, pickup: 2, vehicleCampusArrival: 3 };
const thread = { names: { d: 'Driver', r: 'Rider' }, trip };
const request = { ...trip, initiatorId: 'd', status: 'PENDING', plan: { departure: 4, pickup: 5, vehicleCampusArrival: 6 } };
test('inquiry is distinct from a request and uses evaluated trip context', () => {
  assert.deepEqual(chatContext(thread, 'r'), { title: 'Match inquiry', status: '', trip });
});
test('request context identifies the actual initiator from either role and uses persisted proposed times', () => {
  assert.equal(chatContext(thread, 'd', request).title, 'You sent a request');
  const received = chatContext(thread, 'r', request);
  assert.equal(received.title, 'Driver sent you a request');
  assert.equal(received.status, 'Pending');
  assert.equal(received.trip.pickup, 5);
  assert.equal(received.trip.vehicleCampusArrival, 6);
  assert.equal(chatContext(thread, 'd', { ...request, initiatorId: undefined }).title, 'Rider sent you a request', 'legacy requests were rider initiated');
});
test('terminal statuses remain visible without inventing a reservation or sharing private points', () => {
  for (const [status, label] of [['ACCEPTED', 'Accepted'], ['DECLINED', 'Declined'], ['CANCELLED', 'Cancelled']]) {
    const result = chatContext(thread, 'r', { ...request, status, riderPickup: { latitude: 40, longitude: -73 } });
    assert.equal(result.status, label);
    assert.deepEqual(Object.keys(result.trip).sort(), Object.keys(trip).sort());
  }
});
