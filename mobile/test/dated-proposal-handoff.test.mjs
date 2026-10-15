import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateDriverRecommendations } from '../src/matching/driverRecommendations.ts';
import { sealDatedRideProposal } from '../src/rides/datedRideProposal.ts';
import { getUpcoming, isTrip } from '../src/rides/rideModel.ts';
import {
  createDatedOutgoingRequest,
  transitionDatedOutgoingRequest,
  transitionIncomingRequest,
} from '../src/rides/requestTransitions.ts';
import { buildTripPickupManifest, resolveTripPickupSelection } from '../src/routing/tripPickupRoute.ts';

const localDate = '2026-10-19';
const evaluatedAt = Date.parse('2026-10-19T10:00:00Z') / 1000;
const pickup = { id: 'chosen-public-pin', label: 'Selected public pickup', coordinate: { latitude: 40.9, longitude: -73.12 } };
const commute = {
  startArea: { center: { latitude: 40.8, longitude: -73.1 }, radiusMiles: 2, label: 'Private area' },
  campusLot: 'tabler',
  days: [{ day: 'mon', arriveBy: 9 * 60, leaveAt: null, mode: 'ride' }],
};

function offer(seatsLeft = 2) {
  return { id: 'alex', driverName: 'Alex', startAreaLabel: 'Synthetic area', campusLot: 'tabler', days: ['mon'], pickupTime: 475, arriveBy: 520, leaveAt: 1020, seatsLeft, vehicle: 'Synthetic car', pickupSpot: 'Legacy pickup that must not win' };
}

function profile() {
  return {
    offerId: 'alex', driverStart: { latitude: 40.85, longitude: -73.2 },
    departureWindowMinutes: { earliest: 420, latest: 510 },
    campusArrivalWindowMinutes: { earliest: 450, latest: 600 },
    preferredDepartureMinutes: 450, maxExtraDurationSeconds: 1200,
    maxExtraDurationRatio: 0.75, pickupServiceSeconds: 120,
    skippedDates: [], conflictDates: [],
  };
}

function route(coordinates, durationSeconds, legDurations) {
  return {
    status: 'SUCCESS',
    route: {
      geometry: coordinates,
      durationSeconds,
      distanceMeters: durationSeconds * 10,
      provider: { id: 'test', name: 'Test road estimates', baseUrl: 'https://example.test' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
      legs: legDurations.map((durationSeconds, index) => ({ index, durationSeconds, distanceMeters: durationSeconds * 10, summary: '', steps: [] })),
    },
  };
}

async function proposalFor(riderId = 'rider-1', seatsRequested = 2, seatsLeft = 2) {
  const originalNow = Date.now;
  Date.now = () => evaluatedAt * 1000;
  try {
    const result = await evaluateDriverRecommendations({
      adapter: { route: async (coordinates) => coordinates.length === 2 ? route(coordinates, 1800, [1800]) : route(coordinates, 1920, [600, 1200]) },
      commute,
      localDate,
      timeZone: 'America/New_York',
      riderId,
      offers: [offer(seatsLeft)],
      profiles: [profile()],
      setup: {
        pickupPoint: pickup,
        pickupWindowMinutes: { earliest: 450, latest: 500 },
        destinationArrivalWindowMinutes: { earliest: 480, latest: 570 },
        seatsRequested,
        accessWalkSeconds: 300,
        egressWalkSeconds: 240,
        maxAccessWalkSeconds: 600,
        maxEgressWalkSeconds: 600,
        maxExtraInVehicleSeconds: 900,
      },
      riderSkipped: false,
      riderCommitmentConflict: false,
    });
    const recommendation = result.recommendations[0];
    assert.equal(recommendation.evaluation.status, 'FEASIBLE');
    assert.ok(recommendation.proposal);
    return recommendation.proposal;
  } finally {
    Date.now = originalNow;
  }
}

test('dated proposal preserves selected pickup, date, evaluated times, and two seats through accepted trip and Map manifest', async () => {
  const proposal = await proposalFor();
  const pending = createDatedOutgoingRequest(proposal, 'dated-request');
  assert.deepEqual(pending.days, ['mon']);
  assert.equal(pending.proposal.agreed.requestedSeats, 2);
  assert.deepEqual(pending.proposal.agreed.pickup.coordinate, pickup.coordinate);

  const accepted = transitionDatedOutgoingRequest({
    requests: [pending], requestId: pending.id, status: 'accepted', offers: [offer()], nowEpochSeconds: evaluatedAt + 5,
  });
  assert.equal(accepted.code, 'ACCEPTED');
  const trips = getUpcoming(commute, accepted.requests, [], [offer()], new Date(2026, 9, 19, 6, 0), [], 14).filter(isTrip);
  assert.equal(trips.length, 1, 'one evaluated date must not become a recurring ride');
  const trip = trips[0];
  assert.equal(trip.id, localDate);
  assert.equal(trip.requestedSeats, 2);
  assert.equal(trip.pickupTime, epochMinute(proposal.routingEstimates.plan.pickup, proposal.occurrence.timeZone));
  assert.equal(trip.arriveBy, epochMinute(proposal.routingEstimates.plan.vehicleCampusArrival, proposal.occurrence.timeZone));
  assert.equal(trip.leaveAt, null, 'an unevaluated return trip must not be inferred');
  assert.equal(trip.routingPoints.stops[0].label, pickup.label);

  const selected = resolveTripPickupSelection(trips, { tripId: localDate, date: localDate, direction: 'TO_CAMPUS' });
  const manifest = buildTripPickupManifest(selected);
  assert.deepEqual(manifest.stops[0].coordinate, pickup.coordinate);
  assert.deepEqual(manifest.campus.coordinate, proposal.agreed.campusDropoff.coordinate);
});

test('two dated requests competing for the last seat cannot both be accepted', async () => {
  const first = createDatedOutgoingRequest(await proposalFor('rider-1', 1, 1), 'first');
  const second = createDatedOutgoingRequest(await proposalFor('rider-2', 1, 1), 'second');
  const firstResult = transitionDatedOutgoingRequest({ requests: [first, second], requestId: 'first', status: 'accepted', offers: [offer(1)], nowEpochSeconds: evaluatedAt + 5 });
  const secondResult = transitionDatedOutgoingRequest({ requests: firstResult.requests, requestId: 'second', status: 'accepted', offers: [offer(1)], nowEpochSeconds: evaluatedAt + 6 });
  assert.equal(firstResult.code, 'ACCEPTED');
  assert.equal(secondResult.code, 'NO_REMAINING_CAPACITY');
  assert.equal(secondResult.requests.find((request) => request.id === 'second').status, 'pending');
});

test('driver-side acceptance mutation also enforces the last seat and exact occurrence', async () => {
  const driverCommute = { ...commute, days: [{ ...commute.days[0], mode: 'drive' }], seats: 1 };
  const first = incomingFrom(await proposalFor('rider-1', 1, 1), 'first');
  const second = incomingFrom(await proposalFor('rider-2', 1, 1), 'second');
  const firstResult = transitionIncomingRequest({ commute: driverCommute, requests: [first, second], outgoing: [], requestId: 'first', status: 'accepted', nowEpochSeconds: evaluatedAt + 5 });
  const secondResult = transitionIncomingRequest({ commute: driverCommute, requests: firstResult.requests, outgoing: [], requestId: 'second', status: 'accepted', nowEpochSeconds: evaluatedAt + 6 });
  assert.equal(firstResult.code, 'ACCEPTED');
  assert.equal(secondResult.code, 'NO_REMAINING_CAPACITY');
  assert.equal(secondResult.requests.find((request) => request.id === 'second').status, 'pending');

  const wrongOccurrence = { ...incomingFrom(await proposalFor('rider-3', 1, 1), 'wrong'), days: ['tue'] };
  const wrongResult = transitionIncomingRequest({ commute: driverCommute, requests: [wrongOccurrence], outgoing: [], requestId: 'wrong', status: 'accepted', nowEpochSeconds: evaluatedAt + 5 });
  assert.equal(wrongResult.code, 'WRONG_OCCURRENCE');
  assert.equal(wrongResult.requests[0].status, 'pending');
});

test('legacy seeded requests stay explicitly recurring and are never assigned proposal data', () => {
  const legacy = {
    id: 'legacy', riderName: 'Legacy Rider', startAreaLabel: 'Fixture area', campusLot: 'tabler',
    days: ['mon'], arriveBy: 540, leaveAt: null, addedMinutes: 5,
    pickupSpot: 'Descriptive legacy pickup', status: 'pending',
  };
  const driverCommute = { ...commute, days: [{ ...commute.days[0], mode: 'drive' }], seats: 1 };
  const result = transitionIncomingRequest({ commute: driverCommute, requests: [legacy], outgoing: [], requestId: legacy.id, status: 'accepted', nowEpochSeconds: evaluatedAt });
  assert.equal(result.code, 'ACCEPTED');
  assert.equal(result.requests[0].status, 'accepted');
  assert.equal(result.requests[0].proposal, undefined);
  assert.equal(result.requests[0].pickupSpot, legacy.pickupSpot);
});

test('duplicate, cancelled, and outdated proposals are rejected without changing request state', async () => {
  const proposal = await proposalFor('same-rider', 1, 2);
  const accepted = { ...createDatedOutgoingRequest(proposal, 'accepted'), status: 'accepted' };
  const duplicate = createDatedOutgoingRequest({ ...proposal, proposalId: 'duplicate' }, 'duplicate');
  const tamperedState = [accepted, duplicate];
  const duplicateResult = transitionDatedOutgoingRequest({ requests: tamperedState, requestId: 'duplicate', status: 'accepted', offers: [offer()], nowEpochSeconds: evaluatedAt + 5 });
  assert.equal(duplicateResult.code, 'INVALID_PROPOSAL', 'changing proposal identity without resealing makes it stale/tampered');
  assert.equal(duplicateResult.requests, tamperedState);

  const validDuplicateProposal = reseal(proposal, { proposalId: 'duplicate-valid' });
  const validDuplicate = createDatedOutgoingRequest(validDuplicateProposal, 'duplicate-valid');
  const duplicateCommitment = transitionDatedOutgoingRequest({ requests: [accepted, validDuplicate], requestId: validDuplicate.id, status: 'accepted', offers: [offer()], nowEpochSeconds: evaluatedAt + 5 });
  assert.equal(duplicateCommitment.code, 'DUPLICATE_COMMITMENT');
  assert.equal(duplicateCommitment.requests.find((request) => request.id === validDuplicate.id).status, 'pending');

  const cancelled = { ...createDatedOutgoingRequest(proposal, 'cancelled'), status: 'declined' };
  const cancelledResult = transitionDatedOutgoingRequest({ requests: [cancelled], requestId: cancelled.id, status: 'accepted', offers: [offer()], nowEpochSeconds: evaluatedAt + 5 });
  assert.equal(cancelledResult.code, 'NOT_PENDING');
  assert.equal(cancelledResult.requests[0].status, 'declined');

  const outdatedProposal = reseal(proposal, { proposalId: 'old' }, evaluatedAt - 100, 10);
  const outdated = createDatedOutgoingRequest(outdatedProposal, 'old');
  const outdatedResult = transitionDatedOutgoingRequest({ requests: [outdated], requestId: outdated.id, status: 'accepted', offers: [offer()], nowEpochSeconds: evaluatedAt });
  assert.equal(outdatedResult.code, 'OUTDATED_PROPOSAL');
  assert.equal(outdatedResult.requests[0].status, 'pending');
});

function reseal(proposal, changes, createdAt = proposal.createdAtEpochSeconds, ttl) {
  const { revision: _revision, createdAtEpochSeconds: _created, expiresAtEpochSeconds: _expires, ...payload } = proposal;
  return sealDatedRideProposal({ ...payload, ...changes }, createdAt, ttl);
}

function incomingFrom(proposal, id) {
  return {
    id,
    riderName: proposal.participants.riderId,
    startAreaLabel: 'Synthetic area',
    campusLot: proposal.agreed.campusDropoff.campusLot,
    days: ['mon'],
    arriveBy: 9 * 60,
    leaveAt: null,
    addedMinutes: 4,
    pickupSpot: 'Legacy text must not replace the proposal point',
    status: 'pending',
    proposal,
  };
}

function epochMinute(epochSeconds, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epochSeconds * 1000));
  return Number(parts.find((part) => part.type === 'hour').value) * 60 + Number(parts.find((part) => part.type === 'minute').value);
}
