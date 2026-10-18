const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  nextTomtomBudget,
  tomtomMonthlyLimit,
} = require('../lib/functions/src/tomtomBudget');
const now = Date.parse('2026-10-18T12:00:00Z');
test('monthly budget replaces the daily cap and allows a configurable limit up to the advertised allowance', () => {
  assert.equal(tomtomMonthlyLimit(undefined), 18000);
  assert.equal(tomtomMonthlyLimit('20000'), 20000);
  for (const invalid of [
    '',
    'NaN',
    'Infinity',
    '0',
    '-1',
    '1.5',
    '20001',
    ' 20000',
  ])
    assert.equal(tomtomMonthlyLimit(invalid), null);
  assert.deepEqual(
    nextTomtomBudget({ month: '2026-10', count: 50 }, now, 18000),
    { month: '2026-10', count: 51 },
  );
  assert.deepEqual(
    nextTomtomBudget({ month: '2026-10', count: 17999 }, now, 18000),
    { month: '2026-10', count: 18000 },
  );
  assert.equal(
    nextTomtomBudget({ month: '2026-10', count: 18000 }, now, 18000),
    null,
  );
});
test('UTC month rollover resets the counter; legacy daily usage in the current month is retained', () => {
  assert.deepEqual(
    nextTomtomBudget({ month: '2026-09', count: 18000 }, now, 18000),
    { month: '2026-10', count: 1 },
  );
  assert.deepEqual(
    nextTomtomBudget({ day: '2026-10-17', count: 42 }, now, 18000),
    { month: '2026-10', count: 43 },
  );
  assert.deepEqual(
    nextTomtomBudget(undefined, Date.parse('2026-11-01T00:00:00Z'), 18000),
    { month: '2026-11', count: 1 },
  );
});
test('corrupt counters and invalid configuration fail closed rather than resetting usage', () => {
  for (const count of [-1, NaN, Infinity, 0.5, '0', undefined])
    assert.equal(
      nextTomtomBudget({ month: '2026-10', count }, now, 18000),
      null,
    );
  assert.equal(
    nextTomtomBudget({ month: 'invalid', count: 1 }, now, 18000),
    null,
  );
  assert.equal(nextTomtomBudget(undefined, now, null), null);
});
