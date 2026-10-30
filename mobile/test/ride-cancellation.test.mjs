import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptedRideCanCancel, cancellationReason } from '../src/mvp/rideCancellation.ts';
import { currentCarpools, rideHistory, weekAgenda } from '../src/mvp/ridePresentation.ts';
import { computeBalances } from '../src/payments/tally.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';

const date = '2026-10-26';
const now = localMinuteToEpoch(date, 450);
const ride = {
  id: 'ride', driverId: 'driver', riderId: 'rider', participantIds: ['driver', 'rider'],
  status: 'ACCEPTED', localDate: date,
  plan: { departure: now, pickup: now + 600, vehicleCampusArrival: now + 1800, riderDestinationArrival: now + 2100 },
  price: { cents: 300, riderMiles: 6, extraMiles: 1, costPerMile: .4, fuelType: 'gas', gasWeekOf: '2026-10-12' },
};
test('either participant can cancel until both arrivals, while outsiders and paid/closed rides cannot', () => {
  for (const uid of ['driver', 'rider']) {
    assert.equal(acceptedRideCanCancel(ride, uid, now), true);
    assert.equal(acceptedRideCanCancel(ride, uid, now + 1800), true);
    assert.equal(acceptedRideCanCancel(ride, uid, now + 2100), false);
    assert.equal(acceptedRideCanCancel({ ...ride, settledAt: 1 }, uid, now), false);
    for (const status of ['PENDING', 'DECLINED', 'CANCELLED'])
      assert.equal(acceptedRideCanCancel({ ...ride, status }, uid, now), false);
  }
  assert.equal(acceptedRideCanCancel(ride, 'outsider', now), false);
  for (const plan of [{}, { ...ride.plan, vehicleCampusArrival: NaN }, { ...ride.plan, riderDestinationArrival: Infinity }])
    assert.equal(acceptedRideCanCancel({ ...ride, plan }, 'rider', now), false);
});
test('reasons are required, bounded, trimmed, and keep the explanation’s line breaks', () => {
  for (const value of [undefined, null, 42, '', ' \n\t ', 'a'.repeat(501)])
    assert.equal(cancellationReason(value), undefined);
  assert.equal(cancellationReason('  Class cancelled.\nI’m staying home.  '), 'Class cancelled.\nI’m staying home.');
  assert.equal(cancellationReason('a'.repeat(500)).length, 500);
});
test('cancellation disappears from active trips and gas shares, remains in history, and opens the calendar day', () => {
  const cancelled = { ...ride, status: 'CANCELLED', cancellation: { cancelledBy: 'rider', reason: 'Class cancelled', cancelledAt: now } };
  for (const uid of ['driver', 'rider']) {
    assert.equal(currentCarpools([ride], uid, now).length, 1);
    assert.equal(currentCarpools([cancelled], uid, now).length, 0);
    assert.deepEqual(rideHistory([cancelled], uid, now).map((r) => r.id), [ride.id]);
    assert.equal(computeBalances(uid, [cancelled], [], now).length, 0);
    assert.equal(computeBalances(uid, [cancelled], [], now + 4000).length, 0);
  }
  const commute = { days: [{ day: 'mon', mode: 'ride', arriveBy: 600, startAt: null, leaveAt: null }], campusLot: 'westSide' };
  const [day] = weekAgenda([cancelled], 'rider', now, date, commute, 'rider', {});
  assert.equal(day.status, 'open');
  assert.deepEqual(day.requests, []);
});
