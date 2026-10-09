import assert from 'node:assert/strict';
import test from 'node:test';

import { toPrivacyArea } from '../src/commute/commuteModel.ts';
import {
  parseCommuteDocument,
  parseUserProfileDocument,
  toCommuteDocument,
  toUserProfileDocument,
} from '../src/persistence/userDataModel.ts';

const profile = { firstName: 'Wolfie', role: 'both' };
const commute = {
  startArea: toPrivacyArea({ latitude: 40.8646, longitude: -73.0818 }, 'Centereach area'),
  campusLot: 'tabler',
  days: [
    { day: 'mon', mode: 'ride', arriveBy: 540, leaveAt: 1020 },
    { day: 'tue', mode: 'drive', arriveBy: 570, leaveAt: 990 },
  ],
  seats: 3,
};

test('serializes and parses the persisted user profile schema', () => {
  const document = toUserProfileDocument(profile);

  assert.deepEqual(document, { schemaVersion: 1, firstName: 'Wolfie', role: 'both' });
  assert.deepEqual(parseUserProfileDocument(document), profile);
});

test('serializes and parses the primary commute without exact coordinates', () => {
  const document = toCommuteDocument('user-1', commute);

  assert.equal(document.ownerId, 'user-1');
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(parseCommuteDocument(document, 'user-1'), commute);
});

test('rejects a commute loaded for a different user', () => {
  const document = toCommuteDocument('user-1', commute);

  assert.throws(() => parseCommuteDocument(document, 'user-2'), /does not belong/);
});

test('rejects malformed profile and commute data', () => {
  assert.throws(
    () => parseUserProfileDocument({ schemaVersion: 1, firstName: '', role: 'driver' }),
    /invalid values/,
  );
  assert.throws(
    () =>
      parseCommuteDocument(
        { ...toCommuteDocument('user-1', commute), seats: 99 },
        'user-1',
      ),
    /seat count/,
  );
});
