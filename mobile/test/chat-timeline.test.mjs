import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sameRideAttempt, timelineRideStatus, timelinePriceActions, priceChangeLabel } from '../src/chat/chatTimeline.ts';

const ride = { id: 'ride', attemptId: 'first', driverId: 'driver', riderId: 'rider', status: 'ACCEPTED',
  plan: { departure: 100, vehicleCampusArrival: 200, riderDestinationArrival: 230 } };
const change = { id: 'price-1', proposerId: 'driver', recipientId: 'rider', status: 'PENDING', fromCents: 300, toCents: 350 };
test('ride cards complete only when both arrivals have passed and retain closed request states', () => {
  assert.equal(timelineRideStatus(ride, 201), 'Accepted');
  assert.equal(timelineRideStatus(ride, 230), 'Completed');
  assert.equal(timelineRideStatus({ ...ride, status: 'PENDING' }, 99), 'Pending');
  assert.equal(timelineRideStatus({ ...ride, status: 'PENDING' }, 100), 'Expired');
  assert.equal(timelineRideStatus({ ...ride, status: 'CANCELLED' }, 300), 'Cancelled');
  assert.equal(timelineRideStatus({ ...ride, status: 'DECLINED' }, 300), 'Declined');
});
test('a historical card matches only its exact request and attempt, including legacy attempts', () => {
  assert.equal(sameRideAttempt(ride, ride), true);
  assert.equal(sameRideAttempt({ ...ride, attemptId: 'second' }, ride), false);
  assert.equal(sameRideAttempt({ ...ride, id: 'other-date' }, ride), false);
  assert.equal(sameRideAttempt(undefined, ride), false);
  assert.equal(sameRideAttempt({ ...ride, attemptId: undefined }, { ...ride, attemptId: undefined }), true);
});
test('price cards give only the recipient accept/reject and only the sender withdraw', () => {
  const entry = { type: 'PRICE_CHANGE', ride, priceChange: change };
  assert.equal(timelinePriceActions(entry, 'rider'), 'RESPOND');
  assert.equal(timelinePriceActions(entry, 'driver'), 'WITHDRAW');
  assert.equal(timelinePriceActions(entry, 'outsider'), 'NONE');
  for (const status of ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'])
    assert.equal(timelinePriceActions({ ...entry, priceChange: { ...change, status } }, 'rider'), 'NONE');
  assert.equal(timelinePriceActions({ ...entry, ride: { ...ride, settledAt: 1 } }, 'rider'), 'NONE');
  assert.equal(timelinePriceActions({ ...entry, ride: { ...ride, status: 'CANCELLED' } }, 'rider'), 'NONE');
  assert.equal(timelinePriceActions({ ...entry, priceChange: { ...change, proposerId: 'rider', recipientId: 'driver' } }, 'driver'), 'RESPOND');
  assert.equal(priceChangeLabel('DECLINED'), 'Rejected');
  assert.equal(priceChangeLabel('CANCELLED'), 'Withdrawn');
});
