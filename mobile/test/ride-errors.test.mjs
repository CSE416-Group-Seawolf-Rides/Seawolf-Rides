import assert from 'node:assert/strict';
import test from 'node:test';

import { friendlyRideError } from '../src/mvp/rideErrors.ts';

const err = (code, message) => Object.assign(new Error(message), { code });

test('a changed commute explains what happened and what to do, without a status code', () => {
  const copy = friendlyRideError(err('functions/failed-precondition', 'The commute or calendar changed. Search again. [400]'), 'accept', 'Chris');
  assert.equal(copy.title, 'Plans changed since this request');
  assert.match(copy.message, /ask Chris to send a new one/);
  assert.doesNotMatch(copy.message, /\[400\]/);
});

test('busy routing, changed timing and unknown errors each get plain-language copy', () => {
  assert.equal(friendlyRideError(err('functions/resource-exhausted', 'Demo routing is busy. [429]'), 'request', 'Alex').title, 'Couldn’t reach Seawolf Rides');
  assert.equal(friendlyRideError(err('functions/failed-precondition', 'The proposed timing changed. This request cannot be accepted with different times.'), 'accept', 'Maya').title, 'The trip times changed');
  const fallback = friendlyRideError(err('functions/internal', 'Weird thing [500]'), 'decline', 'Sam');
  assert.deepEqual(fallback, { title: 'Couldn’t decline this request', message: 'Weird thing' });
});
