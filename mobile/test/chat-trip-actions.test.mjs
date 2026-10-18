import assert from 'node:assert/strict';
import test from 'node:test';
import { chatRequestActions, chatRequestInput } from '../src/chat/chatTripActions.ts';
const base = { participantIds: ['d','r'], driverId: 'd', riderId: 'r', status: 'PENDING', plan: { departure: 200 } };
test('only the recipient decides and only the sender cancels, for both initiating roles', () => {
  for (const initiatorId of ['d','r']) {
    const request = { ...base, initiatorId };
    assert.equal(chatRequestActions(request, initiatorId, 100), 'CANCEL');
    assert.equal(chatRequestActions(request, initiatorId === 'd' ? 'r' : 'd', 100), 'DECIDE');
    assert.equal(chatRequestActions(request, 'outsider', 100), 'NONE');
  }
  assert.equal(chatRequestActions(base, 'd', 100), 'DECIDE', 'legacy initiator is the rider');
});
test('closed requests have no pending actions and expired requests cannot be accepted', () => {
  for (const status of ['ACCEPTED','DECLINED','CANCELLED'])
    for (const uid of ['d','r']) assert.equal(chatRequestActions({ ...base, status }, uid, 100), 'NONE');
  assert.equal(chatRequestActions(base, 'd', 200), 'NONE');
  assert.equal(chatRequestActions(base, 'r', 200), 'CANCEL');
});
test('sending from chat uses the reviewed canonical plan and revisions without sending private map points', () => {
  const details = { localDate: '2026-10-26', ownPoint: { latitude: 40, longitude: -73 }, match: {
    driverId: 'd', riderId: 'r', driverRevision: 'fresh-d', riderRevision: 'fresh-r',
    plan: { departure: 100, pickup: 200, vehicleCampusArrival: 300, boardingComplete: 250 },
  } };
  assert.deepEqual(chatRequestInput(details), { source: 'CALENDAR', direction: 'TO_CAMPUS', localDate: details.localDate,
    driverId: 'd', riderId: 'r', driverRevision: 'fresh-d', riderRevision: 'fresh-r',
    proposedPlan: { departure: 100, pickup: 200, vehicleCampusArrival: 300 } });
});
