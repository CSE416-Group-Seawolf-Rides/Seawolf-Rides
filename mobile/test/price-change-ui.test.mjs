import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { partnerName, rideDate } from '../src/mvp/ridePresentation.ts';
import { formatCents } from '../src/payments/pricing.ts';
import { maximumAgreedPrice } from '../src/payments/priceChanges.ts';

const require = createRequire(import.meta.url);
const NativeElement = ({ children, visible }) => visible === false ? null : React.createElement('div', {}, children);
const AppButton = ({ label, disabled }) => React.createElement('button', { disabled }, label);
const mocks = {
  'react-native': { View: NativeElement, Text: NativeElement, Modal: NativeElement, ScrollView: NativeElement, StyleSheet: { create: (s) => s } },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  '../../components/AppButton': { AppButton }, '../../components/Card': { Card: NativeElement },
  '../../mvp/ridePresentation': { partnerName, rideDate }, '../../theme': { colors: {}, radii: {}, spacing: {} },
  '../paymentsClient': {}, '../pricing': { formatCents }, '../priceChanges': { maximumAgreedPrice },
};
const compiled = ts.transpileModule(readFileSync(new URL('../src/payments/components/RidePriceChange.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
const { RidePriceChange, PriceChangeInbox } = module.exports;
const ride = { id: 'ride', driverId: 'driver', riderId: 'rider', driverName: 'Alex', riderName: 'Maya', status: 'ACCEPTED',
  localDate: '2026-10-28', price: { cents: 300, suggestedCents: 300, baseCents: 100, riderMiles: 6, extraMiles: 1, costPerMile: .4 } };
const change = { id: 'proposal', proposerId: 'driver', recipientId: 'rider', fromCents: 300, toCents: 350, status: 'PENDING' };
const render = (uid, request = { ...ride, priceChange: change }) => renderToStaticMarkup(React.createElement(RidePriceChange, { uid, ride: request }));

test('a driver’s proposal gives only the rider accept/reject actions', () => {
  const rider = render('rider');
  assert.match(rider, /Alex proposed \$3\.50/);
  assert.match(rider, /Accept \$3\.50/);
  assert.match(rider, /Reject price change/);
  assert.match(rider, /Current \$3\.00/);
  const driver = render('driver');
  assert.match(driver, /Waiting for Maya/);
  assert.match(driver, /Cancel price change/);
  assert.doesNotMatch(driver, /Accept \$3\.50|Reject price change/);
});

test('a rider’s counterproposal gives only the driver accept/reject actions', () => {
  const request = { ...ride, priceChange: { ...change, proposerId: 'rider', recipientId: 'driver', toCents: 250 } };
  assert.match(render('driver', request), /Accept \$2\.50/);
  assert.match(render('driver', request), /Reject price change/);
  assert.match(render('rider', request), /Waiting for Alex/);
  assert.doesNotMatch(render('rider', request), /Accept \$2\.50/);
});

test('both participants can request changes to unpaid confirmed rides; paid rides and outsiders cannot', () => {
  for (const uid of ['driver', 'rider']) {
    assert.match(render(uid, ride), /Request a price change/);
    assert.match(render(uid, { ...ride, settledAt: 123 }), /Paid gas share \$3\.00/);
    assert.doesNotMatch(render(uid, { ...ride, settledAt: 123 }), /Request a price change/);
    assert.equal(render(uid, { ...ride, status: 'PENDING' }), '');
  }
  assert.equal(render('outsider'), '');
});

test('Rides surfaces pending price changes for either participant without altering the agreed amount', () => {
  for (const uid of ['driver', 'rider']) {
    const html = renderToStaticMarkup(React.createElement(PriceChangeInbox, { uid, rides: [{ ...ride, priceChange: change }] }));
    assert.match(html, /Price-change requests/);
    assert.match(html, /\$3\.50/);
  }
  assert.equal(ride.price.cents, 300);
});
