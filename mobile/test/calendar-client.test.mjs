import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function client(response) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../src/calendar/calendarClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mocks = {
    react: {}, 'firebase/firestore': {},
    'firebase/functions': { httpsCallable: () => async () => ({ data: response }) },
    '../firebase/firebase': { getFirebaseFunctions: () => ({}) }, './commuteCalendar': {},
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, setTimeout });
  return module.exports;
}

test('the new search client rejects the old arrival policy rather than silently using strict windows', async () => {
  await assert.rejects(client({ policyVersion: 3 }).searchCalendar('2026-11-02'), /45-minute matching window/);
  const response = { policyVersion: 4, matches: [] };
  assert.equal(await client(response).searchCalendar('2026-11-02'), response);
});
