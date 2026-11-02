import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { SaveCoordinator, SavePendingError } from '../src/persistence/saveCoordinator.ts';

const require = createRequire(import.meta.url);
function harness() {
  const state = [], effects = [];
  let cursor = 0;
  let member = { user: { id: 'rider' }, isGuest: false };
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  };
  const react = { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect: (effect, deps) => {
    const index = cursor++;
    if (!state[index] || deps.some((value, i) => state[index].deps[i] !== value)) {
      state[index]?.cleanup?.();
      state[index] = { deps, cleanup: effect() };
      effects.push(state[index]);
    }
  } };
  const mocks = {
    react,
    'react-native': { Text: 'text', StyleSheet: { create: (value) => value } },
    'expo-router': { router: {} },
    '../auth/SessionProvider': { useSession: () => member },
    '../components/Screen': { Screen: 'screen' },
    '../theme': { colors: {}, spacing: {} },
    '../persistence/saveCoordinator': { SaveCoordinator: class extends SaveCoordinator { constructor() { super(5); } }, SavePendingError },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../src/account/accountShared.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return { ...module.exports,
    render: () => { cursor = 0; return module.exports.useConfirmedAction(); },
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
    session: (value) => { member = value; },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('a timed-out submission stays pending; retry waits on the original write and confirms once', async () => {
  const h = harness();
  let resolveWrite;
  const write = new Promise((resolve) => { resolveWrite = resolve; });
  let writes = 0, confirmed = 0;
  const operation = () => { writes++; return write; };
  await h.render().run('report-123', operation, () => { confirmed++; });
  let action = h.render();
  assert.equal(action.busy, false);
  assert.equal(action.pending, true);
  assert.match(action.error, /Still waiting/);
  assert.equal(confirmed, 0);
  action.retry();
  await tick();
  assert.equal(writes, 1);
  resolveWrite();
  await tick();
  action = h.render();
  assert.equal(action.pending, false);
  assert.equal(action.busy, false);
  assert.equal(action.error, '');
  assert.equal(confirmed, 1);
});

test('rapid double submission cannot create two writes', async () => {
  const h = harness();
  let writes = 0;
  const action = h.render();
  const operation = async () => { writes++; };
  await Promise.all([action.run('same-report', operation, () => {}), action.run('same-report', operation, () => {})]);
  assert.equal(writes, 1);
});

test('a late acknowledgement cannot update a page after account change or unmount', async () => {
  const h = harness();
  let resolveWrite, confirmed = 0;
  const write = new Promise((resolve) => { resolveWrite = resolve; });
  const waiting = h.render().run('old-account', () => write, () => { confirmed++; });
  await tick();
  h.unmount();
  resolveWrite();
  await waiting;
  assert.equal(confirmed, 0);
});

test('a rejected write never confirms success and can be retried', async () => {
  const h = harness();
  let confirmed = 0;
  await h.render().run('report', async () => { throw new Error('permission-denied'); }, () => { confirmed++; });
  assert.equal(confirmed, 0);
  assert.equal(h.render().pending, false);
  assert.match(h.render().error, /Couldn’t save/);
  await h.render().run('report', async () => {}, () => { confirmed++; });
  assert.equal(confirmed, 1);
});

test('guest and signed-out sessions cannot mount account storage forms', () => {
  const h = harness();
  let formMounted = false;
  for (const session of [{ user: { id: 'guest' }, isGuest: true }, { user: null, isGuest: false }]) {
    h.session(session);
    h.AccountMemberPage({ title: 'Report a problem', children: () => { formMounted = true; } });
  }
  assert.equal(formMounted, false);
  h.session({ user: { id: 'rider' }, isGuest: false });
  h.AccountMemberPage({ title: 'Report a problem', children: (uid) => { assert.equal(uid, 'rider'); formMounted = true; } });
  assert.equal(formMounted, true);
});
