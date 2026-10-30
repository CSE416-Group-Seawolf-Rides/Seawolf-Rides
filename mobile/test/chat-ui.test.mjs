import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { chatContext, chatPartner } from '../src/chat/chatModel.ts';
import { formatWeekOf } from '../src/payments/fuelPrices.ts';
import * as pricing from '../src/payments/pricing.ts';
import * as timeline from '../src/chat/chatTimeline.ts';
import { partnerName, rideDate, rideTime } from '../src/mvp/ridePresentation.ts';

const require = createRequire(import.meta.url);
const nativeElement = (tag) => function NativeElement({ children, accessibilityLabel, visible }) {
  return visible === false ? null : React.createElement(tag, { 'aria-label': accessibilityLabel }, children);
};
const View = nativeElement('div');
const Button = ({ label }) => React.createElement('button', {}, label);
const native = { View, Text: nativeElement('span'), Pressable: nativeElement('button'), TextInput: nativeElement('input'), KeyboardAvoidingView: View,
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
    '../payments/components/RidePriceChange': { RidePriceChange: () => null },
    '../mvp/components/CancelRideButton': { CancelRideButton: () => null, RideCancellationNotice: () => null },
    '../safety/safetyClient': { useIsBlocked: () => false },
    '../profiles/PublicProfileLink': { PublicProfileLink: View, openPublicProfile: () => {} },
    './chatModel': { chatContext, chatPartner },
    './chatTimeline': timeline, './ChatTimelineCard': { ChatTimelineCard: View },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date(1_000_000_000_000) }) },
  };
  mocks['./ChatContextCard'] = loadComponent('../src/chat/ChatContextCard.tsx', { ...mocks, '../mvp/ridePresentation': { rideTime } });
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
  first.props.children[0].props.contextCard.props.children.props.onViewTrip();
  const opened = h.render(LiveChatScreen, { chatId: thread.id });
  const [conversation, trip] = opened.props.children;
  assert.equal(conversation.key, conversationKey);
  assert.ok(trip);
  assert.notEqual(conversation.key, trip.key);
  trip.props.onClose();
  assert.equal(h.render(LiveChatScreen, { chatId: thread.id }).props.children[1], false);
});

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}
test('conversation keeps the draft and scroll position while cards arrive between messages', () => {
  const h = harness();
  h.mocks['../profiles/publicProfiles'] = { resolvePublicProfile: () => ({}) };
  const { ConversationScreen } = loadComponent('../src/screens/ConversationScreen.tsx', h.mocks);
  const props = { conversation: { participantId: 'driver', preview: { participantName: 'Alex' }, messages: [{ id: 'old-text', sender: 'them', text: 'Earlier text' }] },
    onSendMessage: async () => {}, onBack: () => {}, onOpenProfile: () => {},
    renderMessage: (message) => message.id === 'card' ? React.createElement(View, {}, 'Ride card') : null };
  let tree = h.render(ConversationScreen, props);
  descendants(tree).find((node) => node.type === native.TextInput).props.onChangeText('My unfinished reply');
  const scroll = descendants(tree).find((node) => node.props.onContentSizeChange);
  let jumps = 0;
  scroll.props.ref.current = { scrollToEnd: () => jumps++ };
  scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 300 }, contentSize: { height: 1000 } } });
  tree = h.render(ConversationScreen, { ...props, conversation: { ...props.conversation, messages: [...props.conversation.messages,
    { id: 'card' }, { id: 'new-text', sender: 'them', text: 'New reply' }] } });
  assert.equal(descendants(tree).find((node) => node.type === native.TextInput).props.value, 'My unfinished reply');
  descendants(tree).find((node) => node.props.onContentSizeChange).props.onContentSizeChange();
  assert.equal(jumps, 0, 'new cards must not pull someone away from older messages');
  const html = renderToStaticMarkup(tree);
  assert.ok(html.indexOf('Earlier text') < html.indexOf('Ride card'));
  assert.ok(html.indexOf('Ride card') < html.indexOf('New reply'));
});

test('timeline price cards expose the proper actions and submit the exact proposal being reviewed', async () => {
  const h = harness();
  const calls = [];
  Object.assign(h.mocks, {
    '../mvp/ridePresentation': { partnerName, rideDate, rideTime },
    '../payments/pricing': pricing,
    '../payments/paymentsClient': { respondToRidePriceChange: async (...args) => calls.push(args) },
  });
  const { ChatTimelineCard } = loadComponent('../src/chat/ChatTimelineCard.tsx', h.mocks);
  const ride = { id: 'ride', driverId: 'driver', riderId: 'rider', driverName: 'Alex', riderName: 'Maya',
    status: 'ACCEPTED', localDate: thread.localDate, plan, price };
  const entry = { id: 'price-card', type: 'PRICE_CHANGE', ride, sentAt: 1,
    senderId: 'driver', priceChange: { id: 'proposal-original', proposerId: 'driver', recipientId: 'rider', status: 'PENDING', fromCents: 300, toCents: 350 } };
  const props = { entry, uid: 'rider', now: 1, onViewRide: () => {} };
  const tree = h.render(ChatTimelineCard, props);
  const accept = descendants(tree).find((node) => node.props.label === 'Accept $3.50');
  assert.ok(accept);
  assert.ok(descendants(tree).some((node) => node.props.label === 'Reject price change'));
  assert.ok(!descendants(tree).some((node) => node.props.label === 'Withdraw price change'));
  accept.props.onPress(); accept.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [['ride', 'proposal-original', 'ACCEPTED']]);
  const driverTree = h.render(ChatTimelineCard, { ...props, uid: 'driver' });
  assert.ok(descendants(driverTree).some((node) => node.props.label === 'Withdraw price change'));
  assert.ok(!descendants(driverTree).some((node) => node.props.label === 'Reject price change'));
  const answered = h.render(ChatTimelineCard, { ...props, entry: { ...entry, priceChange: { ...entry.priceChange, status: 'ACCEPTED' } } });
  assert.match(renderToStaticMarkup(answered), /Accepted/);
  assert.ok(!descendants(answered).some((node) => node.props.label === 'Accept $3.50'));
});

test('ride cards reuse the original request design and remain bound to their own status and details', () => {
  const h = harness();
  Object.assign(h.mocks, {
    '../mvp/ridePresentation': { partnerName }, '../payments/pricing': pricing,
    '../payments/paymentsClient': {},
  });
  const { ChatTimelineCard } = loadComponent('../src/chat/ChatTimelineCard.tsx', h.mocks);
  const ride = { id: 'first-request', attemptId: 'first-attempt', driverId: 'driver', riderId: 'rider', initiatorId: 'rider',
    driverName: 'Alex', riderName: 'Maya', status: 'PENDING', localDate: thread.localDate, campusLabel: 'Tabler', plan, price };
  const first = { id: 'first-card', type: 'RIDE_REQUEST', ride, senderId: 'rider', sentAt: 1 };
  const second = { ...first, id: 'second-card', ride: { ...ride, id: 'second-request', localDate: '2026-10-27' } };
  let opened;
  const props = { uid: 'driver', now: 1, onViewRide: (value) => { opened = value; } };
  const before = h.render(ChatTimelineCard, { ...props, entry: first });
  assert.equal(before.type, h.mocks['./ChatContextCard'].ChatRequestCard);
  assert.equal(before.props.title, 'Maya sent you a request');
  assert.equal(before.props.status, 'Pending');
  const cancelled = h.render(ChatTimelineCard, { ...props, entry: { ...first, ride: { ...ride, status: 'CANCELLED' } } });
  const later = h.render(ChatTimelineCard, { ...props, entry: second });
  assert.equal(cancelled.props.status, 'Cancelled');
  assert.equal(cancelled.props.localDate, first.ride.localDate);
  assert.equal(later.props.status, 'Pending');
  before.props.onViewTrip();
  assert.equal(opened.id, 'first-request');
  const html = renderToStaticMarkup(cancelled);
  assert.match(html, /Maya sent you a request/);
  assert.match(html, /Cancelled/);
  assert.match(html, /View request/);
});

test('new requests preserve the conversation key, timeline, and the particular older ride already open', () => {
  const h = harness();
  const oldRide = { id: 'old-date', attemptId: 'old-attempt', plan, localDate: thread.localDate };
  const entry = { id: 'old-card', type: 'RIDE_REQUEST', ride: oldRide, sentAt: 1 };
  let current = { thread: { ...thread, requestId: oldRide.id }, messages: [entry, { id: 'text', text: 'Thanks', sentAt: 2 }] };
  Object.assign(h.mocks, {
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'rider' } }) },
    './chatClient': { useChat: () => current, useChatRequest: () => ({}) },
    './chatModel': { chatPartner }, './ChatTripSheet': { ChatTripSheet: View },
    './ChatContextCard': { ChatContextCard: View }, '../screens/ConversationScreen': { ConversationScreen: View },
  });
  const { LiveChatScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', h.mocks);
  const first = h.render(LiveChatScreen, { chatId: thread.id });
  const conversation = first.props.children[0];
  conversation.props.renderMessage({ id: entry.id }).props.onViewRide(oldRide);
  current = { ...current, thread: { ...current.thread, requestId: 'new-date' }, messages: [...current.messages,
    { ...entry, id: 'new-card', ride: { ...oldRide, id: 'new-date' } }, { id: 'reply', text: 'See you', sentAt: 3 }] };
  const next = h.render(LiveChatScreen, { chatId: thread.id });
  assert.equal(next.props.children[0].key, conversation.key);
  assert.deepEqual(next.props.children[0].props.conversation.messages.map((m) => m.id), ['old-card', 'text', 'new-card', 'reply']);
  assert.equal(next.props.children[1].props.selectedRide.id, 'old-date');
  assert.equal(next.props.children[0].props.contextCard.props.children, false, 'no moving request card remains at the top');
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

test('opening a replaced request shows its archived amount and never acts on the new proposal', () => {
  const h = harness();
  const original = { id: 'same-date', attemptId: 'original', driverId: 'driver', riderId: 'rider',
    status: 'CANCELLED', localDate: thread.localDate, plan, price: { ...price, cents: 175 } };
  const replacement = { ...original, attemptId: 'replacement', status: 'PENDING', price: { ...price, cents: 900 } };
  Object.assign(h.mocks, {
    '../commute/commuteModel': {}, '../calendar/matchPresentation': {},
    '../calendar/AcceptedTripMap': { AcceptedTripMap: () => null }, '../mvp/rideRequestClient': {},
    '../mvp/ridePresentation': { rideDate: () => 'Mon', rideTime: () => '9 AM' },
    '../routing/types': {}, '../vehicle/vehicleClient': { useVehicle: () => ({ loaded: true }) },
    './chatClient': { useChatRequest: () => ({ request: replacement, loading: false }) },
    './chatModel': { chatPartner }, './chatTripActions': { chatRequestActions: () => 'DECIDE' },
  });
  const { ChatTripSheet } = loadComponent('../src/chat/ChatTripSheet.tsx', h.mocks);
  const html = renderToStaticMarkup(h.render(ChatTripSheet, {
    thread: { ...thread, requestId: original.id }, selectedRide: original, uid: 'rider', onClose: () => {},
  }));
  assert.match(html, /Archived request/);
  assert.match(html, /\$1\.75/);
  assert.doesNotMatch(html, /\$9\.00|Accept request|Send request|Refresh match/);
});
