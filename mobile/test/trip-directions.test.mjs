import assert from 'node:assert/strict';
import test from 'node:test';

import { tripDirectionsUrl } from '../src/calendar/tripDirections.ts';

const pickupA = { latitude: 40.916691, longitude: -73.139807 };
const pickupB = { latitude: 40.808686, longitude: -73.114521 };
const tabler = { latitude: 40.9097068, longitude: -73.1269548 };

test('Apple Maps gets every pickup as an ordered waypoint, then campus', () => {
  const url = new URL(tripDirectionsUrl('ios', [pickupA, pickupB], tabler));
  assert.equal(url.origin + url.pathname, 'https://maps.apple.com/directions');
  assert.deepEqual(url.searchParams.getAll('waypoint'), ['40.916691,-73.139807', '40.808686,-73.114521']);
  assert.equal(url.searchParams.get('destination'), '40.909707,-73.126955');
  assert.equal(url.searchParams.get('mode'), 'driving');
  assert.equal(url.searchParams.get('source'), null, 'starts from the current location');
});

test('Google Maps gets pickups as pipe-separated waypoints, then campus', () => {
  const url = new URL(tripDirectionsUrl('android', [pickupA, pickupB], tabler));
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('waypoints'), '40.916691,-73.139807|40.808686,-73.114521');
  assert.equal(url.searchParams.get('destination'), '40.909707,-73.126955');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.equal(new URL(tripDirectionsUrl('android', [], tabler)).searchParams.get('waypoints'), null);
});
