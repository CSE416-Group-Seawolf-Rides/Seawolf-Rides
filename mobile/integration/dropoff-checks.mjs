import assert from 'node:assert/strict';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { vehicleFixture } from './matching-fixtures.mjs';
import { CAMPUS_POINTS, localMinuteToEpoch } from '../src/mvp/settings.ts';
export async function verifyDropoff(t, { client, action, date, start, pickup }) {
  await t.test('different and Any campus preferences discover real drivers; earlier proposed timing and actual accepted stop persist', async () => {
    const rider = await client('dropoff-rider', 'rider', pickup, date);
    const alternative = await client('dropoff-a-alternative', 'driver', start, date);
    const preferred = await client('dropoff-z-preferred', 'driver', start, date);
    const setup = async (account, campusLot) => {
      const ref = doc(account.db, 'users', account.uid, 'commutes', 'primary');
      const value = (await getDoc(ref)).data();
      await updateDoc(ref, { campusLot, days: value.days.map((d) => ({ ...d, arriveBy: 580, startAt: account === rider ? 520 : 560 })) });
    };
    await setup(rider, 'lot40');
    await setup(alternative, 'westSide');
    await setup(preferred, 'lot40');
    const first = await action(rider, 'findCommuteMatches', { localDate: date });
    assert.equal(first.totalCandidatePlans, 2);
    assert.equal(first.matches[0].driverId, preferred.uid, 'prefer the requested stop before lexical identity');
    assert.equal(first.matches[0].dropoffPreferenceMatch, true);
    const second = await action(rider, 'findCommuteMatches', { localDate: date, cursor: first.nextCursor });
    assert.equal(second.matches[0].driverId, alternative.uid, 'different stops must not disappear from discovery');
    assert.equal(second.matches[0].dropoffPreferenceMatch, false);
    assert.equal(second.matches[0].dropoffLabel, 'West Side');
    assert.equal(second.matches[0].preferredDropoffLabel, 'Lot 40');
    await updateDoc(doc(rider.db, 'users', rider.uid, 'commutes', 'primary'), { campusLot: 'other', riderDropoffPreference: 'any' });
    const any = await action(rider, 'findCommuteMatches', { localDate: date });
    const match = any.matches[0];
    assert.equal(any.totalCandidatePlans, 2);
    assert.equal(match.driverId, alternative.uid);
    assert.equal(match.preferredDropoffLabel, 'Any');
    assert.equal(match.dropoffPreferenceMatch, true);
    assert.equal(match.plan.departure, localMinuteToEpoch(date, 540));
    assert.equal(match.savedDriverDeparture, localMinuteToEpoch(date, 560));
    assert.equal(match.plan.vehicleCampusArrival, localMinuteToEpoch(date, 577));
    assert.equal((await getDoc(doc(alternative.db, 'users', alternative.uid, 'commutes', 'primary'))).data().days[0].startAt, 560);
    await action(alternative, 'saveVehicleDetails', vehicleFixture(alternative.uid));
    const request = await action(rider, 'createRideRequest', {
      source: 'CALENDAR', direction: 'TO_CAMPUS', localDate: date,
      driverId: match.driverId, riderId: match.riderId,
      driverRevision: match.driverRevision, riderRevision: match.riderRevision,
      attemptId: 'dropoff-reviewed-proposal-1',
      proposedPlan: { departure: match.plan.departure, pickup: match.plan.pickup, vehicleCampusArrival: match.plan.vehicleCampusArrival },
    });
    await action(alternative, 'respondToRideRequest', { requestId: request.id, attemptId: request.attemptId, decision: 'ACCEPTED' });
    for (const account of [rider, alternative]) {
      const accepted = (await getDoc(doc(account.db, 'rideRequests', request.id))).data();
      assert.equal(accepted.campusLabel, 'West Side');
      assert.equal(accepted.plan.departure, match.plan.departure);
      const shared = (await getDoc(doc(account.db, 'ridePickups', request.id))).data();
      assert.deepEqual(shared.campus, CAMPUS_POINTS.find((p) => p.id === 'westSide').coordinate);
    }
  });
}
