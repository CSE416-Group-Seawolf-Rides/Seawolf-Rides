import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import * as cancellation from '../src/mvp/rideCancellation.ts';
import { partnerName, rideDate } from '../src/mvp/ridePresentation.ts';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../src/mvp/components/CancelRideButton.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const now = 1_800_000_000;
const ride = { id: 'ride', driverId: 'driver', riderId: 'rider', driverName: 'Alex', riderName: 'Maya',
  attemptId: 'reviewed-attempt-0001', status: 'ACCEPTED', localDate: '2026-10-26',
  plan: { vehicleCampusArrival: now + 1800, riderDestinationArrival: now + 2100 } };
function harness(call = async () => {}) {
  const state = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  };
  const mocks = {
    react: { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0] },
    'react-native': { KeyboardAvoidingView: 'keyboard', Modal: 'modal', Pressable: 'press', ScrollView: 'scroll',
      Text: 'text', TextInput: 'input', View: 'view', Platform: { OS: 'ios' }, StyleSheet: { create: (s) => s } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 20 }) },
    '../../components/AppButton': { AppButton: 'button' }, '../../theme': { colors: {}, radii: {}, spacing: {} },
    '../rideCancellation': cancellation, '../rideRequestClient': { cancelAcceptedRide: call },
    '../ridePresentation': { partnerName, rideDate }, '../rideErrors': { friendlyRideError: (error) => ({ message: error.message }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return { ...module.exports, render: (props = {}) => {
    cursor = 0;
    return module.exports.CancelRideButton({ ride, uid: 'rider', now, ...props });
  } };
}
function nodes(tree) {
  if (!React.isValidElement(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && node.props.label === label);
const input = (tree) => nodes(tree).find((node) => node.type === 'input');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const uid of ['driver', 'rider']) {
  test(`the ${uid} gets a red Cancel Ride control and must enter a reason before the second confirmation`, async () => {
    const calls = [];
    const h = harness(async (...args) => { calls.push(args); });
    const props = { uid };
    const first = h.render(props);
    assert.equal(button(first, 'Cancel Ride').props.variant, 'destructive');
    button(first, 'Cancel Ride').props.onPress();
    let sheet = h.render(props);
    assert.equal(calls.length, 0);
    assert.ok(nodes(sheet).some((node) => node.props.children === 'Are you sure?'));
    assert.equal(button(sheet, 'Yes, Cancel Ride').props.disabled, true);
    input(sheet).props.onChangeText('   ');
    assert.equal(button(h.render(props), 'Yes, Cancel Ride').props.disabled, true);
    input(sheet).props.onChangeText(' Class cancelled ');
    sheet = h.render(props);
    assert.equal(button(sheet, 'Yes, Cancel Ride').props.disabled, false);
    button(sheet, 'Yes, Cancel Ride').props.onPress();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], ride);
    assert.equal(calls[0][1], 'Class cancelled');
    assert.equal(input(h.render(props)), undefined);
  });
}
test('Keep ride dismisses without sending, and failed cancellation preserves the reason for retry', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw new Error('Check your connection and try again.'); });
  button(h.render(), 'Cancel Ride').props.onPress();
  button(h.render(), 'Keep ride').props.onPress();
  assert.equal(input(h.render()), undefined);
  assert.equal(calls, 0);
  button(h.render(), 'Cancel Ride').props.onPress();
  input(h.render()).props.onChangeText('Car unavailable');
  button(h.render(), 'Yes, Cancel Ride').props.onPress();
  await flush();
  const failed = h.render();
  assert.equal(input(failed).props.value, 'Car unavailable');
  assert.ok(nodes(failed).some((node) => node.props.accessibilityRole === 'alert' && node.props.children.includes('connection')));
  assert.equal(button(failed, 'Yes, Cancel Ride').props.disabled, false);
});
test('duplicate confirmations share one operation and keep the reviewed proposal during a live update', async () => {
  const calls = [];
  let resolve;
  const h = harness((...args) => { calls.push(args); return new Promise((done) => { resolve = done; }); });
  button(h.render(), 'Cancel Ride').props.onPress();
  input(h.render()).props.onChangeText('Car unavailable');
  const props = { ride: { ...ride, attemptId: 'replacement-attempt-0001' } };
  const confirm = button(h.render(props), 'Yes, Cancel Ride');
  confirm.props.onPress();
  confirm.props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].attemptId, ride.attemptId);
  const pending = h.render(props);
  assert.equal(button(pending, 'Keep ride').props.disabled, true);
  assert.equal(button(pending, 'Cancelling…').props.disabled, true);
  resolve();
  await flush();
});
test('completed, paid and nonparticipant views offer no cancellation control', () => {
  const h = harness();
  assert.equal(h.render({ uid: 'outsider' }), null);
  assert.equal(h.render({ now: now + 2100 }), null);
  assert.equal(h.render({ ride: { ...ride, settledAt: 1 } }), null);
  assert.equal(h.render({ ride: { ...ride, status: 'CANCELLED' } }), null);
});
