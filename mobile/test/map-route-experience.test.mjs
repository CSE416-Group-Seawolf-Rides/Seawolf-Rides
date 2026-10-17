import assert from 'node:assert/strict';
import test from 'node:test';

import { LatestGeocodingSearch } from '../src/geocoding/latestGeocodingSearch.ts';
import { createPhotonGeocodingAdapter } from '../src/geocoding/photonAdapter.ts';
import {
  canEditEndpoint,
  createLockedRideEndpoint,
  createRouteEndpoint,
  swapEditableEndpoints,
} from '../src/routing/routeEndpoint.ts';
import { getRideRouteContext } from '../src/routing/rideRouteContext.ts';
import {
  endLocalRouteSession,
  idleRouteSession,
  startLocalRouteSession,
} from '../src/routing/routeSession.ts';

const startCoordinate = { latitude: 40.92047, longitude: -73.12844 };
const destinationCoordinate = { latitude: 40.9130574, longitude: -73.1304816 };

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function photonBody() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-73.12844, 40.92047] },
        properties: {
          osm_type: 'N',
          osm_id: 123,
          name: 'Stony Brook Station',
          street: 'North Country Road',
          city: 'Stony Brook',
          state: 'New York',
          postcode: '11790',
          country: 'United States',
        },
      },
    ],
  };
}

test('endpoint factories preserve labels and explicit sources', () => {
  const gps = createRouteEndpoint(startCoordinate, 'Current location', 'CURRENT_LOCATION');
  const search = createRouteEndpoint(destinationCoordinate, 'West Campus', 'SEARCH_RESULT');
  assert.deepEqual(gps, {
    coordinate: startCoordinate,
    label: 'Current location',
    source: 'CURRENT_LOCATION',
    locked: false,
  });
  assert.equal(search.source, 'SEARCH_RESULT');
  assert.equal(canEditEndpoint(gps), true);
});

test('locked ride endpoints cannot be edited or generically swapped', () => {
  const locked = createLockedRideEndpoint(startCoordinate, 'Agreed pickup');
  const editable = createRouteEndpoint(destinationCoordinate, 'West Campus', 'PRESET');
  assert.equal(canEditEndpoint(locked), false);
  const result = swapEditableEndpoints(locked, editable);
  assert.equal(result.swapped, false);
  assert.equal(result.start, locked);
  assert.equal(result.destination, editable);
});

test('editable route endpoints swap without sharing coordinate objects', () => {
  const start = createRouteEndpoint(startCoordinate, 'Start', 'MAP_SELECTION');
  const destination = createRouteEndpoint(destinationCoordinate, 'Destination', 'PRESET');
  const result = swapEditableEndpoints(start, destination);
  assert.equal(result.swapped, true);
  assert.deepEqual(result.start.coordinate, destinationCoordinate);
  assert.notEqual(result.start.coordinate, destination.coordinate);
});

test('ride routing context locks only a current, unskipped ride with confirmed exact points', () => {
  const trip = {
    id: '2026-10-08',
    day: 'thu',
    whenLabel: 'Today',
    dateLabel: 'Thu, Oct 8',
    thisWeek: true,
    kind: 'ride',
    arriveBy: 540,
    leaveAt: 1020,
    campusLot: 'westSide',
    skipped: false,
    offer: { driverName: 'Alex' },
    routingPoints: {
      confirmed: true,
      start: { coordinate: startCoordinate, label: 'Agreed pickup' },
      destination: { coordinate: destinationCoordinate, label: 'West Campus' },
    },
  };
  const context = getRideRouteContext(trip);
  assert.equal(context.status, 'LOCKED');
  assert.equal(context.start.locked, true);
  assert.equal(context.destination.source, 'CONFIRMED_RIDE');
  assert.deepEqual(getRideRouteContext({ ...trip, whenLabel: 'Tomorrow' }), { status: 'NONE' });
  assert.deepEqual(getRideRouteContext({ ...trip, skipped: true }), { status: 'NONE' });
});

test('current rides without confirmed coordinates remain explicitly unconfirmed', () => {
  const trip = {
    id: '2026-10-08', day: 'thu', whenLabel: 'Today', dateLabel: 'Thu, Oct 8',
    thisWeek: true, kind: 'ride', arriveBy: 540, leaveAt: 1020,
    campusLot: 'westSide', skipped: false, offer: { driverName: 'Alex' },
  };
  assert.deepEqual(getRideRouteContext(trip), {
    status: 'UNCONFIRMED',
    rideId: '2026-10-08',
    rideLabel: "Today's ride with Alex",
  });
});

test('local route session starts once, keeps its route, and ends without trip side effects', () => {
  const start = createRouteEndpoint(startCoordinate, 'Start', 'MAP_SELECTION');
  const destination = createRouteEndpoint(destinationCoordinate, 'Destination', 'PRESET');
  const route = { distanceMeters: 1000, durationSeconds: 300, geometry: [], legs: [], snappedWaypoints: [], provider: { id: 'osrm', name: 'OSRM', baseUrl: 'test' } };
  const active = startLocalRouteSession(idleRouteSession, route, start, destination, 1234);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.route, route);
  assert.equal(active.startedAtEpochMs, 1234);
  assert.equal(startLocalRouteSession(active, route, start, destination, 9999), active);
  assert.deepEqual(endLocalRouteSession(active), { status: 'IDLE' });
});

test('Photon maps contextual address results and validates malformed responses', async () => {
  let url = '';
  const adapter = createPhotonGeocodingAdapter({
    baseUrl: 'https://photon.example.test/',
    fetchImplementation: async (input) => {
      url = input;
      return response(photonBody());
    },
  });
  const result = await adapter.search('Stony Brook station');
  assert.equal(result.status, 'SUCCESS');
  assert.match(url, /q=Stony%20Brook%20station/);
  assert.equal(result.results[0].label, 'Stony Brook Station');
  assert.equal(result.results[0].context, 'North Country Road, Stony Brook, New York, 11790, United States');
  assert.deepEqual(result.results[0].coordinate, startCoordinate);

  const malformed = createPhotonGeocodingAdapter({ fetchImplementation: async () => response({ features: 'wrong' }) });
  assert.equal((await malformed.search('Stony Brook')).code, 'MALFORMED_RESPONSE');
});

test('Photon distinguishes validation, provider, and network failures', async () => {
  const unused = createPhotonGeocodingAdapter({ fetchImplementation: async () => response(photonBody()) });
  assert.equal((await unused.search('  a ')).code, 'INVALID_QUERY');

  const provider = createPhotonGeocodingAdapter({ fetchImplementation: async () => response({}, { ok: false, status: 429 }) });
  const providerResult = await provider.search('West Campus');
  assert.equal(providerResult.code, 'PROVIDER_ERROR');
  assert.equal(providerResult.retryable, true);

  const network = createPhotonGeocodingAdapter({ fetchImplementation: async () => { throw new Error('offline'); } });
  assert.equal((await network.search('West Campus')).code, 'NETWORK_ERROR');
});

test('latest-search guard suppresses stale search responses', async () => {
  const resolvers = [];
  const adapter = { search: () => new Promise((resolve) => resolvers.push(resolve)) };
  const latest = new LatestGeocodingSearch();
  const first = latest.run(adapter, 'Stony');
  const second = latest.run(adapter, 'Stony Brook');
  resolvers[1]({ status: 'SUCCESS', results: [] });
  assert.equal((await second).status, 'CURRENT');
  resolvers[0]({ status: 'SUCCESS', results: [{ id: 'old' }] });
  assert.equal((await first).status, 'STALE');
});
