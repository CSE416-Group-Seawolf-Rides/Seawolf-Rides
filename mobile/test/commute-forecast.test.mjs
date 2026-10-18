import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextForecastDate } from '../src/commute/commuteForecast.ts';
import { localMinuteToEpoch } from '../src/mvp/settings.ts';
import { suggestedStartMinute } from '../src/commute/morningTiming.ts';
test('weekly suggestions use the next future occurrence of each weekday in New York', () => {
  const now = Date.parse('2026-10-19T01:00:00Z') / 1000; // Still Sunday in NY.
  assert.equal(nextForecastDate('mon', now), '2026-10-19');
  assert.equal(nextForecastDate('sun', now), '2026-10-25');
  assert.equal(nextForecastDate('wed', now), '2026-10-21');
});
test('morning and evening suggestions use their own forecast durations, retaining editable minute values', () => {
  assert.equal(suggestedStartMinute(540, 45 * 60), 495);
  assert.equal(suggestedStartMinute(21 * 60 + 15, 25 * 60), 20 * 60 + 50);
  assert.equal(
    suggestedStartMinute(10, 30 * 60),
    null,
    'cross-midnight suggestions need manual input',
  );
});
test('arrival targets retain New York DST offsets and reject ambiguous or skipped local times', () => {
  assert.equal(
    localMinuteToEpoch('2026-10-26', 540),
    Date.parse('2026-10-26T09:00:00-04:00') / 1000,
  );
  assert.equal(
    localMinuteToEpoch('2026-11-02', 540),
    Date.parse('2026-11-02T09:00:00-05:00') / 1000,
  );
  assert.throws(() => localMinuteToEpoch('2026-11-01', 90));
  assert.throws(() => localMinuteToEpoch('2027-03-14', 150));
});
