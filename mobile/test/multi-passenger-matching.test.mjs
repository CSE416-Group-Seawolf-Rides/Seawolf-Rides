import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCalendarPair } from '../src/calendar/calendarMatching.ts';
import { CAMPUS_POINTS } from '../src/mvp/settings.ts';

const campus = CAMPUS_POINTS[0]; // SAC (40.9149, -73.1245)

const dummyRouting = (legsDurationSeconds = [600, 600]) => ({
  timeDependent: false,
  route: async (points) => {
    // When 2 points (origin -> campus direct baseline), single leg
    const isBaseline = points.length === 2;
    const durations = isBaseline ? [500] : legsDurationSeconds;
    return {
      status: 'SUCCESS',
      route: {
        durationSeconds: durations.reduce((a, b) => a + b, 0),
        distanceMeters: 10000,
        legs: durations.map((duration) => ({
          durationSeconds: duration,
          distanceMeters: 5000,
        })),
        snappedWaypoints: points.map((p) => ({
          input: p,
          snapped: p,
          distanceMeters: 5,
        })),
      },
    };
  },
});

test('driver with 3 seats and no commitments evaluates as FEASIBLE with full capacity', async () => {
  const driver = {
    uid: 'driver-gio',
    name: 'Gio',
    revision: 'rev-d1',
    commute: {
      userId: 'driver-gio',
      role: 'driver',
      startPoint: { latitude: 40.8559, longitude: -73.2007 },
      startArea: { label: 'Smithtown', center: { latitude: 40.8559, longitude: -73.2007 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      seats: 3,
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'drive',
      arriveBy: 540, // 9:00 AM
      startAt: 480,  // 8:00 AM
      leaveAt: null,
    },
    seatsRemaining: 3,
    seatsCapacity: 3,
    acceptedStops: [],
  };

  const rider = {
    uid: 'rider-maya',
    name: 'Maya',
    revision: 'rev-r1',
    commute: {
      userId: 'rider-maya',
      role: 'rider',
      startPoint: { latitude: 40.8795, longitude: -73.1585 },
      startArea: { label: 'St. James', center: { latitude: 40.8795, longitude: -73.1585 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'ride',
      arriveBy: 540,
      startAt: 480,
      leaveAt: null,
    },
  };

  const now = 1793500000;
  const date = '2026-11-02';
  const evaluation = await evaluateCalendarPair(driver, rider, date, dummyRouting(), now);

  assert.equal(evaluation.status, 'FEASIBLE');
  assert.ok(evaluation.plan.departure > 0);
  assert.ok(evaluation.plan.riderDestinationArrival > evaluation.plan.departure);
});

test('driver with 1 accepted stop evaluates 2nd rider with multi-stop sequence', async () => {
  const driverWithMayaAccepted = {
    uid: 'driver-gio',
    name: 'Gio',
    revision: 'rev-d1',
    commute: {
      userId: 'driver-gio',
      role: 'driver',
      startPoint: { latitude: 40.8559, longitude: -73.2007 },
      startArea: { label: 'Smithtown', center: { latitude: 40.8559, longitude: -73.2007 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      seats: 3,
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'drive',
      arriveBy: 540,
      startAt: 480,
      leaveAt: null,
    },
    seatsRemaining: 2, // 1 seat filled by Maya, 2 remaining
    seatsCapacity: 3,
    acceptedStops: [
      {
        coordinate: { latitude: 40.8795, longitude: -73.1585 },
        name: 'Maya',
      },
    ],
  };

  const riderChris = {
    uid: 'rider-chris',
    name: 'Chris',
    revision: 'rev-r2',
    commute: {
      userId: 'rider-chris',
      role: 'rider',
      startPoint: { latitude: 40.8448, longitude: -73.1523 },
      startArea: { label: 'Nesconset', center: { latitude: 40.8448, longitude: -73.1523 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'ride',
      arriveBy: 540,
      startAt: 480,
      leaveAt: null,
    },
  };

  const now = 1793500000;
  const date = '2026-11-02';
  // Multi-stop route with 3 legs: start -> stop1 (Maya) -> stop2 (Chris) -> campus
  const evaluation = await evaluateCalendarPair(driverWithMayaAccepted, riderChris, date, dummyRouting([300, 300, 400]), now);

  assert.equal(evaluation.status, 'FEASIBLE');
  assert.ok(evaluation.plan.departure > 0);
  assert.ok(evaluation.plan.riderDestinationArrival > evaluation.plan.departure);
});

test('driver with 0 seats remaining is rejected with NO_SEAT', async () => {
  const driverFull = {
    uid: 'driver-gio',
    name: 'Gio',
    revision: 'rev-d1',
    commute: {
      userId: 'driver-gio',
      role: 'driver',
      startPoint: { latitude: 40.8559, longitude: -73.2007 },
      startArea: { label: 'Smithtown', center: { latitude: 40.8559, longitude: -73.2007 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      seats: 2,
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'drive',
      arriveBy: 540,
      startAt: 480,
      leaveAt: null,
    },
    seatsRemaining: 0, // completely full!
    seatsCapacity: 2,
    acceptedStops: [
      { coordinate: { latitude: 40.8795, longitude: -73.1585 }, name: 'Maya' },
      { coordinate: { latitude: 40.8448, longitude: -73.1523 }, name: 'Chris' },
    ],
  };

  const riderAlex = {
    uid: 'rider-alex',
    name: 'Alex',
    revision: 'rev-r3',
    commute: {
      userId: 'rider-alex',
      role: 'rider',
      startPoint: { latitude: 40.8584, longitude: -73.1251 },
      startArea: { label: 'Lake Grove', center: { latitude: 40.8584, longitude: -73.1251 }, radiusMiles: 2 },
      campusLot: campus.id,
      days: [],
      discoveryEnabled: true,
      riderDropoffPreference: 'any',
    },
    day: {
      day: 'mon',
      mode: 'ride',
      arriveBy: 540,
      startAt: 480,
      leaveAt: null,
    },
  };

  const now = 1793500000;
  const date = '2026-11-02';
  const evaluation = await evaluateCalendarPair(driverFull, riderAlex, date, dummyRouting(), now);

  assert.equal(evaluation.status, 'INFEASIBLE');
  assert.ok(evaluation.reasonCodes.includes('NO_SEAT'));
});
