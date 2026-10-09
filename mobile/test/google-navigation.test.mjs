import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateNavigation,
  arriveNavigation,
  beginNavigation,
  buildGoogleNavigationRequest,
  decodeNavigationRequest,
  encodeNavigationRequest,
  endNavigation,
  getGoogleNavigationAvailability,
  resetNavigation,
} from '../src/navigation/googleNavigation.ts';
import { getRideRouteContext } from '../src/routing/rideRouteContext.ts';
import { remainingRouteWaypoints } from '../src/navigation/routeNavigationRequest.ts';

const start = { latitude: 40.92, longitude: -73.13 };
const pickup = { latitude: 40.915, longitude: -73.125 };
const campus = { latitude: 40.913, longitude: -73.13 };

function trip(overrides = {}) {
  return {
    id: '2026-10-09', day: 'fri', whenLabel: 'Today', dateLabel: 'Fri, Oct 9',
    thisWeek: true, kind: 'drive', arriveBy: 540, leaveAt: 1020,
    campusLot: 'westSide', skipped: false, riders: [], ...overrides,
  };
}

test('standalone navigation uses only destination and never a typed preview origin', () => {
  const result = buildGoogleNavigationRequest(
    { label: 'West Campus', coordinate: campus },
    { status: 'NONE' },
    null,
  );
  assert.equal(result.status, 'READY');
  assert.equal(result.request.mode, 'STANDALONE');
  assert.deepEqual(result.request.waypoints, [{ label: 'West Campus', coordinate: campus }]);
});

test('confirmed ride keeps intermediate stop order and identifies the ride', () => {
  const currentTrip = trip({
    routingPoints: {
      confirmed: true,
      start: { coordinate: start, label: 'Driver start' },
      stops: [
        { coordinate: pickup, label: 'Maya pickup' },
        { coordinate: { latitude: 40.914, longitude: -73.124 }, label: 'Jordan pickup' },
      ],
      destination: { coordinate: campus, label: 'West Campus' },
    },
  });
  const context = getRideRouteContext(currentTrip);
  const result = buildGoogleNavigationRequest(
    { label: 'ignored editable destination', coordinate: start },
    context,
    currentTrip,
  );
  assert.equal(result.status, 'READY');
  assert.equal(result.request.mode, 'CONFIRMED_RIDE');
  assert.equal(result.request.rideId, currentTrip.id);
  assert.deepEqual(result.request.waypoints.map((waypoint) => waypoint.label), [
    'Maya pickup', 'Jordan pickup', 'West Campus',
  ]);
});

test('a current drive with riders never silently skips unconfirmed pickups', () => {
  const currentTrip = trip({
    riders: [{ riderName: 'Maya' }],
    routingPoints: {
      confirmed: true,
      start: { coordinate: start, label: 'Driver start' },
      destination: { coordinate: campus, label: 'West Campus' },
    },
  });
  const result = buildGoogleNavigationRequest(
    { label: 'West Campus', coordinate: campus },
    getRideRouteContext(currentTrip),
    currentTrip,
  );
  assert.deepEqual(result, {
    status: 'BLOCKED',
    code: 'PICKUPS_UNCONFIRMED',
    message: 'This drive has riders but no confirmed pickup coordinates. Navigation will not skip them.',
  });
});

test('configuration and native development-build states are distinct', () => {
  assert.equal(getGoogleNavigationAvailability({ configured: false, nativeModuleAvailable: false }).status, 'CONFIGURATION_REQUIRED');
  assert.equal(getGoogleNavigationAvailability({ configured: true, nativeModuleAvailable: false }).status, 'DEVELOPMENT_BUILD_REQUIRED');
  assert.deepEqual(getGoogleNavigationAvailability({ configured: true, nativeModuleAvailable: true }), { status: 'READY' });
});

test('navigation lifecycle suppresses duplicate starts and has explicit end/reset transitions', () => {
  const starting = beginNavigation({ status: 'IDLE' });
  assert.deepEqual(starting, { status: 'STARTING' });
  assert.equal(beginNavigation(starting), starting);
  const active = activateNavigation(starting);
  assert.deepEqual(active, { status: 'ACTIVE' });
  assert.deepEqual(arriveNavigation(active), { status: 'ARRIVED' });
  const ending = endNavigation(active);
  assert.deepEqual(ending, { status: 'ENDING' });
  assert.equal(endNavigation(ending), ending);
  assert.deepEqual(resetNavigation(), { status: 'IDLE' });
});

test('serialized navigation requests validate coordinates and reject malformed route params', () => {
  const request = {
    destinationLabel: 'West Campus',
    mode: 'STANDALONE',
    waypoints: [{ label: 'West Campus', coordinate: campus }],
  };
  assert.deepEqual(decodeNavigationRequest(encodeNavigationRequest(request)), request);
  assert.equal(decodeNavigationRequest('{"mode":"STANDALONE","destinationLabel":"x","waypoints":[]}'), null);
  assert.equal(decodeNavigationRequest('{"mode":"STANDALONE","destinationLabel":"x","waypoints":[{"label":"x","coordinate":{"latitude":91,"longitude":0}}]}'), null);
  assert.equal(decodeNavigationRequest('not json'), null);
});

test('rerouting keeps every not-yet-reached stop in its original order', () => {
  const request = {
    destinationLabel: 'Campus', mode: 'CONFIRMED_RIDE',
    waypoints: [
      { label: 'Pickup A', coordinate: start },
      { label: 'Pickup B', coordinate: pickup },
      { label: 'Campus', coordinate: campus },
    ],
  };
  assert.deepEqual(
    remainingRouteWaypoints(request, 0, 1).map((item) => item.label),
    ['Pickup B', 'Campus'],
  );
  assert.deepEqual(
    remainingRouteWaypoints(request, 1, 1).map((item) => item.label),
    ['Campus'],
  );
});
