import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO3X7_LOCAL_DATE,
  DEMO3X7_NAMESPACE,
  DEMO3X7_TIME_ZONE,
  createDemo3x7Fixture,
  createDemo3x7TravelEstimate,
  demo3x7Coordinates,
} from '../src/matching/demo3x7Fixtures.ts';
import { resolvePublicProfile } from '../src/profiles/publicProfiles.ts';
import {
  adaptIncomingRequestContract,
  datedProposalMatchesDriverOccurrence,
  driverOccurrenceFromDatedProposal,
  driverOccurrenceToLegacyOverride,
  getAcceptedMembers,
  getDriverCapacity,
  getRiderCommitment,
} from '../src/rides/groupRideContracts.ts';
import { sealDatedRideProposal } from '../src/rides/datedRideProposal.ts';
import { driverOfferFixtures } from '../src/rides/rideFixtures.ts';

const driverKeys = ['jordan', 'morgan', 'taylor'];
const riderKeys = ['ava', 'ben', 'chloe', 'diego', 'emi', 'finn', 'grace'];

test('demo3x7 factory loads three separate cars and seven available intents without requests or memberships', () => {
  const { state } = createDemo3x7Fixture({ generationId: 'generation-a' });

  assert.equal(state.namespace, DEMO3X7_NAMESPACE);
  assert.equal(state.generationId, 'generation-a');
  assert.equal(state.offers.length, 3);
  assert.equal(state.driverOccurrences.length, 3);
  assert.equal(state.riderIntents.length, 7);
  assert.deepEqual(state.pendingRequests, []);
  assert.deepEqual(state.acceptedMemberships, []);
  assert.deepEqual(state.combinedPlans, []);
  assert.equal(new Set(state.driverOccurrences.map((item) => item.id)).size, 3);
  assert.equal(new Set(state.driverOccurrences.map((item) => item.offerId)).size, 3);
  assert.ok(state.driverOccurrences.every((item) => item.occurrence.localDate === DEMO3X7_LOCAL_DATE));
  assert.ok(state.driverOccurrences.every((item) => item.occurrence.timeZone === DEMO3X7_TIME_ZONE));
  assert.ok(state.driverOccurrences.every((item) => item.occurrence.direction === 'TO_CAMPUS'));
  assert.ok(state.riderIntents.every((item) => item.availability === 'AVAILABLE'));
  assert.ok(state.riderIntents.every((item) => item.occurrence.localDate === DEMO3X7_LOCAL_DATE));
});

test('driver contracts preserve exact capacities, windows, coordinates, baselines, and active detour limits', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'driver-data' });
  const byKey = Object.fromEntries(driverKeys.map((key) => [key, fixture.state.driverOccurrences.find((item) => item.id.includes(`-${key}-`))]));

  assert.deepEqual(driverKeys.map((key) => byKey[key].passengerCapacity), [3, 3, 2]);
  assert.deepEqual(driverKeys.map((key) => minute(byKey[key].departureWindow.earliest)), [7 * 60 + 55, 8 * 60, 8 * 60 + 10]);
  assert.deepEqual(driverKeys.map((key) => minute(byKey[key].departureWindow.latest)), [8 * 60 + 5, 8 * 60 + 20, 8 * 60 + 30]);
  assert.deepEqual(driverKeys.map((key) => minute(byKey[key].preferredDeparture)), [8 * 60, 8 * 60 + 10, 8 * 60 + 20]);
  assert.deepEqual(driverKeys.map((key) => byKey[key].start.coordinate), [demo3x7Coordinates.Q, demo3x7Coordinates.M, demo3x7Coordinates.R]);
  assert.ok(driverKeys.every((key) => minute(byKey[key].campusArrivalWindow.earliest) === 8 * 60 + 30));
  assert.ok(driverKeys.every((key) => minute(byKey[key].campusArrivalWindow.latest) === 9 * 60));

  const baselineMinutes = driverKeys.map((key) => availableMinutes(createDemo3x7TravelEstimate(fixture.nodeByDriverOccurrenceId[byKey[key].id], 'C')));
  assert.deepEqual(baselineMinutes, [40, 30, 10]);
  const activeLimits = driverKeys.map((key, index) => Math.min(byKey[key].maxExtraDurationSeconds, baselineMinutes[index] * 60 * byKey[key].maxExtraDurationRatio));
  assert.deepEqual(activeLimits, [15 * 60, 15 * 60, 5 * 60]);
});

test('rider intents preserve exact windows, seats, walking assumptions, and unconfirmed Grace', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'rider-data' });
  const byKey = Object.fromEntries(riderKeys.map((key) => [key, fixture.state.riderIntents.find((item) => item.id.includes(`-${key}-`))]));

  assert.deepEqual(riderKeys.map((key) => byKey[key].requestedSeats), [1, 2, 1, 1, 1, 1, 1]);
  assert.deepEqual(riderKeys.map((key) => [minute(byKey[key].pickupWindow.earliest), minute(byKey[key].pickupWindow.latest)]), [
    [490, 492], [500, 501], [480, 535], [480, 525], [550, 560], [480, 535], [480, 535],
  ]);
  for (const key of riderKeys) {
    const intent = byKey[key];
    assert.deepEqual([minute(intent.destinationArrivalWindow.earliest), minute(intent.destinationArrivalWindow.latest)], [510, 540]);
    assert.equal(intent.pickupServiceSeconds, 120);
    assert.equal(intent.accessWalkSeconds, 300);
    assert.equal(intent.egressWalkSeconds, 300);
    assert.equal(intent.maxAccessWalkSeconds, 600);
    assert.equal(intent.maxEgressWalkSeconds, 600);
    assert.equal(intent.maxExtraInVehicleSeconds, 900);
    assert.equal(intent.acceptedCampusDropoff.campusLot, 'tabler');
  }
  assert.equal(byKey.grace.pickup.status, 'UNCONFIRMED');
  assert.equal(fixture.nodeByRiderIntentId[byKey.grace.id], undefined, 'Grace must not have an exact routing node');
  assert.equal(byKey.ava.pickup.status, 'CONFIRMED');
  assert.deepEqual(byKey.ava.pickup.point.coordinate, demo3x7Coordinates.M);
  assert.deepEqual(byKey.ben.pickup.point.coordinate, demo3x7Coordinates.H);
  assert.deepEqual(byKey.chloe.pickup.point.coordinate, demo3x7Coordinates.S);
  assert.deepEqual(byKey.diego.pickup.point.coordinate, demo3x7Coordinates.R);
  assert.deepEqual(byKey.emi.pickup.point.coordinate, demo3x7Coordinates.H);
  assert.deepEqual(byKey.finn.pickup.point.coordinate, demo3x7Coordinates.P);
});

test('fixture matrix is exact, directed, coherent, and provides explicit zero co-located legs', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'matrix' });
  const nodes = ['Q', 'M', 'H', 'R', 'S', 'P', 'C'];
  const expected = {
    Q: [0, 10, 20, 30, 38, 55, 40], M: [14, 0, 10, 20, 28, 45, 30],
    H: [28, 14, 0, 10, 18, 35, 20], R: [42, 28, 14, 0, 8, 25, 10],
    S: [52, 38, 24, 10, 0, 22, 7], P: [73, 59, 45, 31, 26, 0, 17],
    C: [56, 42, 28, 14, 9, 15, 0],
  };
  for (const from of nodes) {
    assert.deepEqual(nodes.map((to) => availableMinutes(fixture.travelMatrix[from][to])), expected[from]);
    for (const to of nodes) {
      const estimate = fixture.travelMatrix[from][to];
      assert.equal(estimate.distanceMeters, availableMinutes(estimate) * 600);
      for (const via of nodes) {
        assert.ok(availableMinutes(estimate) <= availableMinutes(fixture.travelMatrix[from][via]) + availableMinutes(fixture.travelMatrix[via][to]));
      }
    }
  }
  assert.equal(availableMinutes(fixture.travelMatrix.Q.M), 10);
  assert.equal(availableMinutes(fixture.travelMatrix.M.Q), 14);
  assert.equal(availableMinutes(fixture.travelMatrix.M.M), 0, 'Morgan and Ava share a coordinate but retain separate identities');
  assert.equal(availableMinutes(fixture.travelMatrix.R.R), 0, 'Taylor and Diego share a coordinate but retain separate identities');
});

test('capacity is car-scoped while rider commitment spans cars for the same occurrence tuple', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'selectors' });
  const jordan = fixture.state.driverOccurrences.find((item) => item.id.includes('-jordan-'));
  const morgan = fixture.state.driverOccurrences.find((item) => item.id.includes('-morgan-'));
  const ava = fixture.state.riderIntents.find((item) => item.id.includes('-ava-'));
  const ben = fixture.state.riderIntents.find((item) => item.id.includes('-ben-'));
  fixture.state.acceptedMemberships.push(
    membership('request-jordan-ava', jordan.id, ava, 1),
    membership('request-morgan-ben', morgan.id, ben, 2),
  );

  assert.deepEqual(getDriverCapacity(fixture.state, jordan.id), { passengerCapacity: 3, committedSeats: 1, remainingSeats: 2 });
  assert.deepEqual(getDriverCapacity(fixture.state, morgan.id), { passengerCapacity: 3, committedSeats: 2, remainingSeats: 1 });
  assert.deepEqual(getAcceptedMembers(fixture.state, jordan.id).map((item) => item.requestId), ['request-jordan-ava']);
  assert.equal(getRiderCommitment(fixture.state, ava.riderParticipantId, DEMO3X7_LOCAL_DATE, 'TO_CAMPUS', DEMO3X7_TIME_ZONE)?.driverOccurrenceId, jordan.id);
  assert.equal(getRiderCommitment(fixture.state, ava.riderParticipantId, DEMO3X7_LOCAL_DATE, 'TO_CAMPUS', 'UTC'), null);
});

test('fixture factories isolate mutable state while retaining stable identities and distinct generations', () => {
  const first = createDemo3x7Fixture({ generationId: 'first-generation' });
  const second = createDemo3x7Fixture({ generationId: 'second-generation' });
  first.state.offers[0].driverName = 'Changed only in first';
  first.state.driverOccurrences[0].start.coordinate.latitude = 0;
  first.travelMatrix.Q.M.durationSeconds = 999;

  assert.equal(second.state.offers[0].driverName, 'Jordan — Queens');
  assert.equal(second.state.driverOccurrences[0].start.coordinate.latitude, demo3x7Coordinates.Q.latitude);
  assert.equal(second.travelMatrix.Q.M.durationSeconds, 600);
  assert.deepEqual(first.state.offers.map((item) => item.id), second.state.offers.map((item) => item.id));
  assert.deepEqual(first.state.riderIntents.map((item) => item.id), second.state.riderIntents.map((item) => item.id));
  assert.notEqual(first.state.generationId, second.state.generationId);
});

test('original Jordan and demo3x7 Jordan have isolated offer and participant identities', () => {
  const original = driverOfferFixtures.find((offer) => offer.id === 'jordan');
  const fixture = createDemo3x7Fixture({ generationId: 'jordan-isolation' });
  const queens = fixture.state.offers.find((offer) => offer.id.includes('-jordan-'));
  const queensOccurrence = fixture.state.driverOccurrences.find((item) => item.offerId === queens.id);
  assert.ok(original);
  assert.ok(queens);
  assert.ok(queensOccurrence);
  assert.equal(original.driverName, 'Jordan');
  assert.equal(queens.driverName, 'Jordan — Queens');
  assert.equal(resolvePublicProfile(original.participantId).displayName, 'Jordan');
  assert.equal(resolvePublicProfile(queens.participantId).displayName, 'Jordan — Queens');
  assert.notEqual(original.id, queens.id);
  assert.notEqual(original.participantId, queens.participantId);
  assert.equal(queensOccurrence.offerId, queens.id);
  assert.equal(queensOccurrence.driverParticipantId, queens.participantId);
  assert.notEqual(original, queens);

  queens.driverName = 'Mutated fixture copy';
  queens.seatsLeft = 0;
  assert.equal(original.driverName, 'Jordan');
  assert.equal(original.seatsLeft, 2);
  const fresh = createDemo3x7Fixture({ generationId: 'jordan-isolation-fresh' });
  assert.equal(fresh.state.offers.find((offer) => offer.id.includes('-jordan-')).driverName, 'Jordan — Queens');
  assert.equal(fresh.state.offers.find((offer) => offer.id.includes('-jordan-')).seatsLeft, 3);
});

test('all ten profiles are stable and namespaced separately from Friday namesakes', () => {
  for (const key of [...driverKeys, ...riderKeys]) {
    const profile = resolvePublicProfile(`demo3x7-person-${key}`);
    assert.equal(profile.synthetic, true);
    assert.equal(profile.participantId, `demo3x7-person-${key}`);
  }
  assert.notEqual(resolvePublicProfile('demo3x7-person-ava').participantId, resolvePublicProfile('friday-driver-test-ava').participantId);
  assert.notEqual(resolvePublicProfile('demo3x7-person-ben').participantId, resolvePublicProfile('friday-driver-test-ben').participantId);
  assert.notEqual(resolvePublicProfile('demo3x7-person-chloe').participantId, resolvePublicProfile('friday-driver-test-chloe').participantId);
});

test('V1 proposal and legacy adapters preserve explicit identity and incompleteness', () => {
  const fixture = createDemo3x7Fixture({ generationId: 'adapter-generation' });
  const source = fixture.state.driverOccurrences[0];
  const rider = fixture.state.riderIntents[0];
  const proposal = proposalFrom(source, rider);
  const adapted = driverOccurrenceFromDatedProposal(proposal, {
    driverOccurrenceId: source.id,
    scenarioNamespace: fixture.state.namespace,
    generationId: fixture.state.generationId,
    driverContractRevision: source.contractRevision,
    passengerCapacity: source.passengerCapacity,
  });
  assert.equal(adapted.id, source.id);
  assert.equal(adapted.offerId, source.offerId);
  assert.equal(adapted.driverParticipantId, source.driverParticipantId);
  assert.deepEqual(adapted.occurrence, source.occurrence);
  assert.equal(datedProposalMatchesDriverOccurrence(proposal, source), true);
  assert.equal(datedProposalMatchesDriverOccurrence({ ...proposal, participants: { ...proposal.participants, driverId: 'different-driver' } }, source), false);
  assert.equal(driverOccurrenceToLegacyOverride(adapted).id, source.id);
  assert.equal(adaptIncomingRequestContract({ id: 'legacy' }).status, 'LEGACY_INCOMPLETE');
  assert.equal(adaptIncomingRequestContract({ id: 'dated', proposal }).proposal, proposal);
});

function availableMinutes(estimate) {
  assert.equal(estimate.status, 'AVAILABLE');
  return estimate.durationSeconds / 60;
}

function minute(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  return date.getUTCHours() * 60 + date.getUTCMinutes() - 4 * 60;
}

function membership(requestId, driverOccurrenceId, intent, seats) {
  return {
    requestId, driverOccurrenceId, riderIntentId: intent.id, riderParticipantId: intent.riderParticipantId,
    proposalId: `proposal-${requestId}`, proposalRevision: `revision-${requestId}`,
    requestedSeats: seats, acceptedAtEpochSeconds: 1,
  };
}

function proposalFrom(driver, rider) {
  const pickup = rider.pickup.point;
  const baseline = createDemo3x7TravelEstimate('Q', 'C');
  const first = createDemo3x7TravelEstimate('Q', 'M');
  const second = createDemo3x7TravelEstimate('M', 'C');
  return sealDatedRideProposal({
    schema: 'seawolf-rides/dated-to-campus-proposal', version: 1, proposalId: 'adapter-proposal',
    occurrence: { ...driver.occurrence },
    participants: { riderId: rider.riderParticipantId, driverId: driver.driverParticipantId, offerId: driver.offerId },
    agreed: {
      requestedSeats: rider.requestedSeats,
      driverStart: { label: driver.start.label, coordinate: { ...driver.start.coordinate }, accuracy: 'SELECTED_POINT' },
      pickup: { pointId: pickup.pointId, label: pickup.label, coordinate: { ...pickup.coordinate }, accuracy: 'SELECTED_POINT' },
      campusDropoff: { campusLot: driver.campusDropoff.campusLot, label: driver.campusDropoff.label, coordinate: { ...driver.campusDropoff.coordinate }, accuracy: 'SELECTED_POINT' },
      driverDepartureWindow: { ...driver.departureWindow }, driverCampusArrivalWindow: { ...driver.campusArrivalWindow },
      driverPreferredDeparture: driver.preferredDeparture, driverMaxExtraDurationSeconds: driver.maxExtraDurationSeconds,
      driverMaxExtraDurationRatio: driver.maxExtraDurationRatio, riderPickupWindow: { ...rider.pickupWindow },
      riderDestinationArrivalWindow: { ...rider.destinationArrivalWindow }, pickupServiceSeconds: rider.pickupServiceSeconds,
      accessWalkSeconds: rider.accessWalkSeconds, egressWalkSeconds: rider.egressWalkSeconds,
      maxAccessWalkSeconds: rider.maxAccessWalkSeconds, maxEgressWalkSeconds: rider.maxEgressWalkSeconds,
      maxExtraInVehicleSeconds: rider.maxExtraInVehicleSeconds,
    },
    routingEstimates: {
      evaluatedAtEpochSeconds: 1, travel: { startToPickup: first, pickupToCampus: second, startToCampus: baseline },
      plan: {
        occurrence: { localDate: DEMO3X7_LOCAL_DATE, direction: 'TO_CAMPUS' }, feasibleDepartureWindow: { ...driver.departureWindow },
        departure: driver.preferredDeparture, pickup: rider.pickupWindow.earliest,
        boardingComplete: rider.pickupWindow.earliest + rider.pickupServiceSeconds,
        vehicleCampusArrival: rider.pickupWindow.earliest + rider.pickupServiceSeconds + second.durationSeconds,
        riderDestinationArrival: rider.pickupWindow.earliest + rider.pickupServiceSeconds + second.durationSeconds + rider.egressWalkSeconds,
      },
      metrics: {
        soloDurationSeconds: baseline.durationSeconds, sharedDurationSeconds: first.durationSeconds + rider.pickupServiceSeconds + second.durationSeconds,
        driverExtraDurationSeconds: 120, activeDriverDetourLimitSeconds: 900,
        riderInVehicleSeconds: second.durationSeconds, riderExtraInVehicleSeconds: 0,
        sharedDistanceMeters: first.distanceMeters + second.distanceMeters, driverExtraDistanceMeters: 0,
        accessWalkSeconds: rider.accessWalkSeconds, egressWalkSeconds: rider.egressWalkSeconds,
      },
    },
  }, 1);
}
