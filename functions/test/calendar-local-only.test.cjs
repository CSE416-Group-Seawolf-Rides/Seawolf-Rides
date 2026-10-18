const assert = require('node:assert/strict');
const test = require('node:test');
const { findCommuteMatches, setCommuteDay } = require('../lib/functions/src/calendarMatching');
test('calendar search and edits cannot access cloud data outside the named demo emulators', async () => {
  const before = process.env.FUNCTIONS_EMULATOR;
  delete process.env.FUNCTIONS_EMULATOR;
  try {
    for (const action of [findCommuteMatches, setCommuteDay]) {
      await assert.rejects(action.run({ auth: { uid: 'test' }, data: {} }), { code: 'failed-precondition' });
    }
  } finally {
    if (before === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = before;
  }
});
