import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { formatCents } from '../src/payments/pricing.ts';
import { describeDates } from '../src/payments/tally.ts';

// Render the actual component with native elements mapped to HTML. This verifies the
// confirmation controls without loading Expo's native modules or contacting Firebase.
const require = createRequire(import.meta.url);
const nativeElement = (tag) => function NativeElement({ children, accessibilityLabel, disabled }) {
  return React.createElement(tag, { 'aria-label': accessibilityLabel, disabled }, children);
};
const mocks = {
  'react-native': {
    View: nativeElement('div'), Text: nativeElement('span'), Pressable: nativeElement('button'),
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  },
  'expo-haptics': {},
  '../../components/Avatar': { Avatar: () => null },
  '../../theme': { colors: {}, radii: {}, spacing: {} },
  '../paymentHandles': { methodLabels: { venmo: 'Venmo', paypal: 'PayPal' } },
  '../paymentsClient': { confirmSettlement: () => { throw new Error('Unexpected network call'); } },
  '../pricing': { formatCents },
  '../tally': { describeDates },
  './SettleUpSheet': { SettleUpSheet: () => null },
  './AdjustPriceButton': { AdjustPriceButton: () => null },
};
const compiled = ts.transpileModule(
  readFileSync(new URL('../src/payments/components/GasShares.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
});
const { GasShares } = module.exports;
const balance = {
  counterpartId: 'alex', counterpartName: 'Alex', direction: 'owed',
  due: [{ requestId: 'unpaid', localDate: '2026-10-12', cents: 300 }],
  dueCents: 300, upcomingCents: 300,
  awaitingConfirmation: [
    { id: 'first', cents: 250, method: 'venmo' },
    { id: 'second', cents: 500, method: 'paypal' },
  ],
};

test('drivers can confirm every pending payment while another ride remains unpaid', () => {
  const html = renderToStaticMarkup(React.createElement(GasShares, { uid: 'me', balances: [balance], coveredCents: 0 }));
  assert.match(html, /Confirm you received \$2\.50 from Alex/);
  assert.match(html, /Confirm you received \$5\.00 from Alex/);
  assert.equal((html.match(/Got it/g) ?? []).length, 2);
  assert.match(html, /\$3\.00/);
});

test('riders see sent payments independently of their remaining settle-up balance', () => {
  const html = renderToStaticMarkup(React.createElement(GasShares, {
    uid: 'me', balances: [{ ...balance, direction: 'owe' }], coveredCents: 0,
  }));
  assert.match(html, /Settle up \$3\.00 with Alex/);
  assert.equal((html.match(/Waiting for Alex to confirm/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Got it/);
});
