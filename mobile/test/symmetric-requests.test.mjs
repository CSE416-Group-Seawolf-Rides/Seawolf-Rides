import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requestInitiator,
  requestRecipient,
  requestCanCancel,
  findTripRequest,
} from '../src/mvp/rideRequestModel.ts';
import {
  currentCarpools,
  requestNeedsAnswer,
  rideHistory,
  historyLabel,
  weekAgenda,
} from '../src/mvp/ridePresentation.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
const date = '2026-10-19',
  now = localMinuteToEpoch(date, 400);
const request = {
  id: 'pair',
  participantIds: ['driver', 'rider'],
  driverId: 'driver',
  riderId: 'rider',
  driverName: 'Alex',
  riderName: 'Sam',
  localDate: date,
  status: 'PENDING',
  plan: {
    departure: now + 3600,
    pickup: now + 3900,
    vehicleCampusArrival: now + 5000,
    riderDestinationArrival: now + 5000,
  },
};
test('either role can initiate; only its recipient gets decisions and only its sender can cancel', () => {
  for (const initiatorId of ['driver', 'rider']) {
    const item = { ...request, initiatorId };
    const recipient = initiatorId === 'driver' ? 'rider' : 'driver';
    assert.equal(requestInitiator(item), initiatorId);
    assert.equal(requestRecipient(item), recipient);
    assert.equal(requestCanCancel(item, initiatorId), true);
    assert.equal(requestCanCancel(item, recipient), false);
    assert.equal(requestNeedsAnswer(item, recipient, now), true);
    assert.equal(requestNeedsAnswer(item, initiatorId, now), false);
    assert.equal(currentCarpools([item], initiatorId, now)[0].pending[0].id, item.id);
    assert.equal(currentCarpools([item], recipient, now).length, 0);
  }
});
test('legacy rider requests retain their existing sender/recipient and cancelled proposals leave upcoming views', () => {
  assert.equal(requestInitiator(request), 'rider');
  assert.equal(requestRecipient(request), 'driver');
  const cancelled = { ...request, status: 'CANCELLED' };
  for (const uid of request.participantIds) {
    assert.equal(requestCanCancel(cancelled, uid), false);
    assert.equal(requestNeedsAnswer(cancelled, uid, now), false);
    assert.equal(currentCarpools([cancelled], uid, now).length, 0);
    assert.equal(rideHistory([cancelled], uid, now)[0].status, 'CANCELLED');
    assert.equal(weekAgenda([cancelled], uid, now, date, null, 'both', {}).length, 0);
  }
  assert.equal(historyLabel(cancelled), 'Cancelled');
});
test('an active request is found from either arrangement; a cancelled opposite arrangement does not hide a new match', () => {
  const reverse = { ...request, driverId: 'rider', riderId: 'driver', attemptId: 'new' };
  const cancelled = { ...request, status: 'CANCELLED', attemptId: 'old' };
  assert.equal(findTripRequest([cancelled, reverse], request, date), reverse);
  assert.equal(findTripRequest([cancelled], request, date), cancelled);
  assert.equal(findTripRequest([cancelled], reverse, date), undefined);
  assert.equal(findTripRequest([reverse], request, '2026-10-20'), undefined);
});
test('confirmed rides are never cancellable requests', () => {
  assert.equal(
    requestCanCancel({ ...request, status: 'ACCEPTED', initiatorId: 'driver' }, 'driver'),
    false,
  );
});
