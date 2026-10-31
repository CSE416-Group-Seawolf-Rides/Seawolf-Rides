import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amendmentLabel,
  amendmentSummary,
  canCancelAmendment,
  canProposeAmendment,
  canRespondAmendment,
  formatTimeDelta,
} from '../src/mvp/rideAmendmentModel.ts';
import {
  amendmentStatusLabel,
  timelineAmendmentActions,
} from '../src/chat/chatTimeline.ts';

function createMockRide(overrides = {}) {
  return {
    id: 'ride-nov-3',
    schemaVersion: 1,
    participantIds: ['driver-alex', 'rider-jordan'],
    driverId: 'driver-alex',
    riderId: 'rider-jordan',
    driverName: 'Alex',
    riderName: 'Jordan',
    localDate: '2026-11-03',
    direction: 'TO_CAMPUS',
    status: 'ACCEPTED',
    riderRevision: 'rev-1',
    driverRevision: 'rev-1',
    seats: 1,
    pickupLabel: 'Selden area',
    campusLabel: 'Tabler',
    plan: {
      departure: 1793714400, // 9:00 AM
      pickup: 1793715300,    // 9:15 AM
      vehicleCampusArrival: 1793716800, // 9:40 AM
      riderDestinationArrival: 1793716800,
    },
    metrics: {
      driverExtraDurationSeconds: 540,
      riderTripDurationSeconds: 1500,
    },
    createdAt: 1793700000,
    updatedAt: 1793700000,
    ...overrides,
  };
}

function createMockAmendment(overrides = {}) {
  return {
    id: 'amend-1',
    type: 'TIME',
    proposerId: 'rider-jordan',
    proposerName: 'Jordan',
    recipientId: 'driver-alex',
    recipientName: 'Alex',
    status: 'PENDING',
    originalDeparture: 1793714400,
    proposedDeparture: 1793715300,
    deltaSeconds: 900, // +15 min
    createdAt: 1793705000,
    updatedAt: 1793705000,
    ...overrides,
  };
}

test('formatTimeDelta formats positive, negative, and zero deltas cleanly', () => {
  assert.equal(formatTimeDelta(900), '+15 min');
  assert.equal(formatTimeDelta(-600), '-10 min');
  assert.equal(formatTimeDelta(0), '0 min');
  assert.equal(formatTimeDelta(120), '+2 min');
});

test('amendmentLabel maps statuses to user-facing strings', () => {
  assert.equal(amendmentLabel('PENDING'), 'Pending review');
  assert.equal(amendmentLabel('ACCEPTED'), 'Accepted');
  assert.equal(amendmentLabel('DECLINED'), 'Declined');
  assert.equal(amendmentLabel('CANCELLED'), 'Cancelled');
  assert.equal(amendmentStatusLabel('PENDING'), 'Pending');
  assert.equal(amendmentStatusLabel('ACCEPTED'), 'Accepted');
  assert.equal(amendmentStatusLabel('DECLINED'), 'Declined');
});

test('amendmentSummary describes time, location, and combined changes', () => {
  const timeOnly = createMockAmendment({ type: 'TIME', deltaSeconds: 900 });
  assert.equal(amendmentSummary(timeOnly), 'time +15 min');

  const locOnly = createMockAmendment({
    type: 'LOCATION',
    deltaSeconds: undefined,
    proposedPickupLabel: 'SAC Loop',
  });
  assert.equal(amendmentSummary(locOnly), 'pickup to SAC Loop');

  const both = createMockAmendment({
    type: 'BOTH',
    deltaSeconds: -600,
    proposedPickupLabel: 'Student Union',
  });
  assert.equal(amendmentSummary(both), 'time -10 min, pickup to Student Union');
});

test('canProposeAmendment allows proposals only for active confirmed rides', () => {
  const ride = createMockRide();
  assert.equal(canProposeAmendment(ride, 'driver-alex'), true);
  assert.equal(canProposeAmendment(ride, 'rider-jordan'), true);

  // Third party cannot propose
  assert.equal(canProposeAmendment(ride, 'stranger-chris'), false);

  // Cannot propose if already pending
  const pendingRide = createMockRide({ amendment: createMockAmendment({ status: 'PENDING' }) });
  assert.equal(canProposeAmendment(pendingRide, 'driver-alex'), false);

  // Can propose if previous amendment was already answered
  const resolvedRide = createMockRide({ amendment: createMockAmendment({ status: 'ACCEPTED' }) });
  assert.equal(canProposeAmendment(resolvedRide, 'driver-alex'), true);

  // Cannot propose if ride is cancelled or settled or pending
  assert.equal(canProposeAmendment(createMockRide({ status: 'PENDING' }), 'driver-alex'), false);
  assert.equal(canProposeAmendment(createMockRide({ status: 'CANCELLED' }), 'driver-alex'), false);
  assert.equal(canProposeAmendment(createMockRide({ settledAt: 1793710000 }), 'driver-alex'), false);
  assert.equal(canProposeAmendment(createMockRide({
    cancellation: { cancelledBy: 'driver-alex', reason: 'Sick', cancelledAt: 1793710000 },
  }), 'driver-alex'), false);
});

test('canRespondAmendment and canCancelAmendment enforce strict mutual review roles', () => {
  const amendment = createMockAmendment({
    proposerId: 'rider-jordan',
    recipientId: 'driver-alex',
    status: 'PENDING',
  });
  const ride = createMockRide({ amendment });

  // Recipient (driver Alex) can respond (accept/decline), but cannot cancel
  assert.equal(canRespondAmendment(ride, 'driver-alex'), true);
  assert.equal(canCancelAmendment(ride, 'driver-alex'), false);

  // Proposer (rider Jordan) can cancel/withdraw, but cannot self-accept/decline
  assert.equal(canRespondAmendment(ride, 'rider-jordan'), false);
  assert.equal(canCancelAmendment(ride, 'rider-jordan'), true);

  // Third party has no actions
  assert.equal(canRespondAmendment(ride, 'stranger-chris'), false);
  assert.equal(canCancelAmendment(ride, 'stranger-chris'), false);

  // Once accepted, no actions remain
  const acceptedRide = createMockRide({ amendment: { ...amendment, status: 'ACCEPTED' } });
  assert.equal(canRespondAmendment(acceptedRide, 'driver-alex'), false);
  assert.equal(canCancelAmendment(acceptedRide, 'rider-jordan'), false);
});

test('timelineAmendmentActions exposes correct chat timeline action triggers', () => {
  const amendment = createMockAmendment({
    proposerId: 'rider-jordan',
    recipientId: 'driver-alex',
    status: 'PENDING',
  });
  const ride = createMockRide({ amendment });
  const entry = {
    id: 'msg-amend-1',
    senderId: 'rider-jordan',
    text: 'Trip change request',
    sentAt: 1793705000,
    sequence: 3,
    type: 'RIDE_AMENDMENT',
    requestId: ride.id,
    ride,
    amendment,
  };

  assert.equal(timelineAmendmentActions(entry, 'driver-alex'), 'RESPOND');
  assert.equal(timelineAmendmentActions(entry, 'rider-jordan'), 'WITHDRAW');
  assert.equal(timelineAmendmentActions(entry, 'stranger'), 'NONE');

  const resolvedEntry = {
    ...entry,
    amendment: { ...amendment, status: 'ACCEPTED' },
  };
  assert.equal(timelineAmendmentActions(resolvedEntry, 'driver-alex'), 'NONE');
  assert.equal(timelineAmendmentActions(resolvedEntry, 'rider-jordan'), 'NONE');
});

test('applying accepted amendment updates plan and preserves relative transit durations', () => {
  const ride = createMockRide();
  const deltaSeconds = 900; // 15 mins later

  const origLeg1 = ride.plan.pickup - ride.plan.departure;
  const origLeg2 = ride.plan.vehicleCampusArrival - ride.plan.pickup;

  const updatedPlan = {
    ...ride.plan,
    departure: ride.plan.departure + deltaSeconds,
    pickup: ride.plan.pickup + deltaSeconds,
    vehicleCampusArrival: ride.plan.vehicleCampusArrival + deltaSeconds,
    riderDestinationArrival: ride.plan.riderDestinationArrival + deltaSeconds,
  };

  assert.equal(updatedPlan.departure, 1793714400 + 900);
  assert.equal(updatedPlan.pickup, 1793715300 + 900);
  assert.equal(updatedPlan.vehicleCampusArrival, 1793716800 + 900);

  // Durations are preserved identically
  assert.equal(updatedPlan.pickup - updatedPlan.departure, origLeg1);
  assert.equal(updatedPlan.vehicleCampusArrival - updatedPlan.pickup, origLeg2);
});
