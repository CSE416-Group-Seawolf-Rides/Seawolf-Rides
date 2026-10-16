import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseAvatarPresentation } from '../src/profiles/avatarModel.ts';
import {
  participantIdForOffer,
  participantIdForRequest,
  resolvePublicProfile,
} from '../src/profiles/publicProfiles.ts';
import { conversationFixtures } from '../src/prototypeData/fixtures.ts';
import { buildFridayDriverTest, resetFridayDriverTestState } from '../src/rides/fridayDriverTest.ts';
import { driverOfferFixtures, riderRequestFixtures } from '../src/rides/rideFixtures.ts';

test('resolves public profiles by stable participant ID rather than display name', () => {
  const driver = driverOfferFixtures.find((offer) => offer.id === 'alex');
  assert.ok(driver);
  const driverId = participantIdForOffer(driver);
  const riderId = 'rider-alex';
  const driverProfile = resolvePublicProfile(driverId);
  const riderProfile = resolvePublicProfile(riderId);
  assert.equal(driverProfile.displayName, 'Alex');
  assert.equal(riderProfile.displayName, 'Alex');
  assert.notEqual(driverProfile.participantId, riderProfile.participantId);
  assert.equal(driverProfile.role, 'driver');
  assert.equal(riderProfile.role, 'rider');
});

test('request, accepted-trip passenger, and chat resolve Maya to one identity', () => {
  const request = riderRequestFixtures.find((candidate) => candidate.id === 'maya');
  const chat = conversationFixtures.find((candidate) => candidate.preview.id === 'maya-chat');
  assert.ok(request);
  assert.ok(chat);
  const acceptedTrip = { riders: [{ ...request, status: 'accepted' }] };
  assert.equal(participantIdForRequest(request), chat.participantId);
  assert.equal(participantIdForRequest(acceptedTrip.riders[0]), chat.participantId);
  assert.equal(resolvePublicProfile(chat.participantId).displayName, 'Maya');
});

test('legacy mappings and missing profiles produce safe, non-private fallbacks', () => {
  assert.equal(participantIdForRequest({ id: 'chris' }), 'demo-rider-chris');
  const missing = resolvePublicProfile('unknown-participant', 'Taylor');
  assert.deepEqual(missing, {
    participantId: 'unknown-participant', displayName: 'Taylor', synthetic: false, publicInfo: [],
  });
});

test('missing and broken photos use stable sample or default avatar presentations', () => {
  assert.equal(chooseAvatarPresentation({ hasImage: true, imageFailed: false, sampleAvatar: 'ocean' }), 'IMAGE');
  assert.equal(chooseAvatarPresentation({ hasImage: true, imageFailed: true, sampleAvatar: 'ocean' }), 'SAMPLE');
  assert.equal(chooseAvatarPresentation({ hasImage: true, imageFailed: true }), 'DEFAULT');
  assert.equal(chooseAvatarPresentation({ hasImage: false, imageFailed: false }), 'DEFAULT');
});

test('Friday test reset and reload retain Ava, Ben, and Chloe participant identities', async () => {
  const adapter = { route: async (coordinates) => ({
    status: 'SUCCESS',
    route: {
      geometry: coordinates, durationSeconds: coordinates.length === 2 ? 4800 : 5100,
      distanceMeters: 60000, provider: { id: 'test', name: 'Test', baseUrl: 'test://route' },
      snappedWaypoints: coordinates.map((coordinate) => ({ input: coordinate, snapped: coordinate, distanceMeters: 0, name: '' })),
      legs: coordinates.slice(1).map((_, index) => ({ index, durationSeconds: coordinates.length === 2 ? 4800 : index === 0 ? 1800 : 3300, distanceMeters: 30000, summary: '', steps: [] })),
    },
  }) };
  const first = await buildFridayDriverTest({ adapter, driverId: 'demo-user', evaluatedAtEpochSeconds: 1_797_200_000 });
  const second = await buildFridayDriverTest({ adapter, driverId: 'demo-user', evaluatedAtEpochSeconds: 1_797_200_010 });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'SUCCESS');
  const firstIds = first.requests.map(participantIdForRequest);
  const reset = resetFridayDriverTestState(first.requests, [first.occurrence]);
  assert.deepEqual(reset.incoming, []);
  assert.deepEqual(second.requests.map(participantIdForRequest), firstIds);
  assert.deepEqual(firstIds, ['friday-driver-test-ava', 'friday-driver-test-ben', 'friday-driver-test-chloe']);
});
