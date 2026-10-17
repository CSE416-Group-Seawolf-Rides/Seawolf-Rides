const assert = require('node:assert/strict');
const test = require('node:test');
const { findMatches, MatchingError } = require('../lib/mobile/src/mvp/service');
const { localMinuteToEpoch } = require('../lib/mobile/src/mvp/settings');
test('deployment bundle contains shared domain and rejects forged callable inputs', async () => {
  await assert.rejects(findMatches('rider', { riderId: 'other' }, {}, {}), MatchingError);
  assert.equal(localMinuteToEpoch('2026-10-19', 480), Date.parse('2026-10-19T12:00:00Z') / 1000);
});
