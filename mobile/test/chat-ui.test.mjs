import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { chatPartner } from '../src/chat/chatModel.ts';
import { formatWeekOf } from '../src/payments/fuelPrices.ts';
import * as pricing from '../src/payments/pricing.ts';

const require = createRequire(import.meta.url);
const nativeElement = (tag) => function NativeElement({ children, accessibilityLabel, visible }) {
  return visible === false ? null : React.createElement(tag, { 'aria-label': accessibilityLabel }, children);
};
const View = nativeElement('div');
const Button = ({ label }) => React.createElement('button', {}, label);
const native = { View, Text: nativeElement('span'), Pressable: nativeElement('button'),
  ScrollView: View, Modal: View, Platform: { OS: 'ios' }, StyleSheet: { create: (s) => s, absoluteFill: {} } };

function loadComponent(file, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return module.exports;
}

// Drive the actual screen's state through its callbacks, while keeping native modules
// and Firebase outside this rendering test. No timers, network calls or new dependencies.
function harness() {
  const state = [];
  const effects = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  };
  const react = { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0],
    useEffect: (effect) => effects.push(effect), useCallback: (fn) => fn };
  const mocks = { react, 'react-native': native,
    'expo-router': { router: {} },
    'react-native-safe-area-context': { SafeAreaView: View, useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-native-maps': { __esModule: true, default: View, Circle: () => null, Marker: () => null },
    '../components/Avatar': { Avatar: () => null }, '../components/Card': { Card: View },
    '../components/Screen': { Screen: View }, '../components/AppButton': { AppButton: Button },
    '../theme': { colors: {}, spacing: {}, radii: {} },
  };
  mocks['../payments/components/PriceTag'] = loadComponent('../src/payments/components/PriceTag.tsx', {
    'react-native': native, '../../theme': mocks['../theme'], '../fuelPrices': { formatWeekOf }, '../pricing': pricing,
  });
  return { mocks, flushEffects: () => effects.splice(0).forEach((effect) => effect()), render: (component, props) => { cursor = 0; return component(props); } };
}
const future = 2_000_000_000;
const price = { cents: 350, baseCents: 100, riderMiles: 6, extraMiles: 1, costPerMile: .4, fuelType: 'gas', gasWeekOf: '2026-10-12' };
const thread = { id: 'chat', participantIds: ['driver', 'rider'], names: { driver: 'Alex', rider: 'Maya' },
  localDate: '2026-10-26', campusLabel: 'Tabler', trip: { driverId: 'driver', riderId: 'rider' } };
const plan = { departure: future, pickup: future + 600, vehicleCampusArrival: future + 1800 };

test('opening trip details keeps distinct sibling keys and preserves the conversation identity', () => {
  const h = harness();
  Object.assign(h.mocks, {
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'rider' } }) },
    './chatClient': { useChat: () => ({ thread, messages: [] }), useChatRequest: () => ({}) },
    './chatModel': { chatPartner }, './ChatTripSheet': { ChatTripSheet: View },
    './ChatContextCard': { ChatContextCard: View }, '../screens/ConversationScreen': { ConversationScreen: View },
  });
  const { LiveChatScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', h.mocks);
  const first = h.render(LiveChatScreen, { chatId: thread.id });
  const conversationKey = first.props.children[0].key;
  first.props.children[0].props.contextCard.props.onViewTrip();
  const opened = h.render(LiveChatScreen, { chatId: thread.id });
  const [conversation, trip] = opened.props.children;
  assert.equal(conversation.key, conversationKey);
  assert.ok(trip);
  assert.notEqual(conversation.key, trip.key);
  trip.props.onClose();
  assert.equal(h.render(LiveChatScreen, { chatId: thread.id }).props.children[1], false);
});

for (const uid of ['rider', 'driver']) {
  test(`chat match details show a refreshed price for the ${uid}`, async () => {
    const h = harness();
    Object.assign(h.mocks, {
      '../commute/commuteModel': { METERS_PER_MILE: 1609.344 },
      '../calendar/matchPresentation': { matchMapRegion: () => ({}) },
      '../calendar/AcceptedTripMap': { AcceptedTripMap: () => null },
      '../mvp/rideRequestClient': {}, '../mvp/ridePresentation': { rideDate: () => 'Mon', rideTime: () => '9 AM' },
      '../routing/types': { trafficForecastIsStale: () => false },
      '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date(1_000_000_000_000) }) },
      '../vehicle/vehicleClient': { useVehicle: () => ({ loaded: true, vehicle: {} }) },
      './chatClient': { useChatRequest: () => ({ loading: false }), getChatMatch: async () => ({
        localDate: thread.localDate, match: { driverId: 'driver', plan, price, addedDrivingSeconds: 300,
          area: { radiusMiles: 2, center: { latitude: 40.9, longitude: -73.1 } } },
      }) },
      './chatModel': { chatPartner }, './chatTripActions': {},
    });
    const { ChatTripSheet } = loadComponent('../src/chat/ChatTripSheet.tsx', h.mocks);
    const props = { thread, uid, onClose: () => {} };
    h.render(ChatTripSheet, props);
    h.flushEffects();
    await Promise.resolve();
    const html = renderToStaticMarkup(h.render(ChatTripSheet, props));
    assert.match(html, /\$3\.50/);
    assert.match(html, /Gas share/);
    assert.match(html, /Suggested amount before requesting/);
    assert.match(html, /Paid directly to the driver after the ride/);
    assert.match(html, uid === 'driver' ? /Rider chips in \$3\.50 for gas/ : /\$3\.50 gas share per ride/);
  });
}

test('request details show the locked amount, free rides and an explicit legacy fallback', () => {
  for (const cents of [175, 0, undefined]) {
    const h = harness();
    const request = { id: 'request', driverId: 'driver', riderId: 'rider', status: 'ACCEPTED', plan,
      localDate: thread.localDate, ...(cents === undefined ? {} : { price: { ...price, cents } }) };
    Object.assign(h.mocks, {
      '../commute/commuteModel': {}, '../calendar/matchPresentation': {},
      '../calendar/AcceptedTripMap': { AcceptedTripMap: () => null }, '../mvp/rideRequestClient': {},
      '../mvp/ridePresentation': { rideDate: () => 'Mon', rideTime: () => '9 AM' },
      '../routing/types': {}, '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date(1_000_000_000_000) }) },
      '../vehicle/vehicleClient': { useVehicle: () => ({ loaded: true }) },
      './chatClient': { useChatRequest: () => ({ request, loading: false }) },
      './chatModel': { chatPartner }, './chatTripActions': { chatRequestActions: () => 'NONE' },
    });
    const { ChatTripSheet } = loadComponent('../src/chat/ChatTripSheet.tsx', h.mocks);
    const html = renderToStaticMarkup(h.render(ChatTripSheet, {
      thread: { ...thread, requestId: request.id }, uid: 'rider', onClose: () => {},
    }));
    if (cents === undefined) assert.match(html, /No gas share was recorded for this request/);
    else {
      assert.match(html, cents === 0 ? /Free/ : /\$1\.75/);
      assert.match(html, /Agreed amount/);
      if (cents === 0) assert.match(html, /No payment needed/);
    }
  }
});
