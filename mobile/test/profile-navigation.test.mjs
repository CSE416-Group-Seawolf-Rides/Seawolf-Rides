import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { chatPartner } from '../src/chat/chatModel.ts';
import { parsePublicProfile } from '../src/profiles/publicProfiles.ts';
import * as presentation from '../src/mvp/ridePresentation.ts';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) });
  return module.exports;
}
function harness() {
  const state = [], effects = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  };
  const react = { ...React, useState, useRef: (value) => useState(() => ({ current: value }))[0], useCallback: (fn) => fn,
    useEffect: (effect, deps) => {
      const index = cursor++;
      const old = state[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) effects.push(() => {
        old?.cleanup?.(); state[index] = { deps, cleanup: effect() };
      });
    } };
  const native = { Pressable: 'press', Text: 'text', View: 'view', ScrollView: 'scroll', Modal: 'modal', ActivityIndicator: 'loading',
    Platform: { OS: 'ios' }, StyleSheet: { create: (s) => s, absoluteFill: {} },
    Animated: { View: 'animated', Value: class { interpolate() { return 0; } setValue() {} }, timing: () => ({ start() {}, stop() {} }) } };
  const routes = [];
  const mocks = { react, 'react-native': native, 'expo-router': { router: { push: (route) => routes.push(route) } },
    'react-native-safe-area-context': { SafeAreaView: 'safe', useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-native-maps': { __esModule: true, default: 'map', Circle: 'circle', Marker: 'marker' },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'icon' },
    '../components/AppButton': { AppButton: 'button' }, '../components/Avatar': { Avatar: 'avatar' },
    '../components/Card': { Card: 'card' }, '../components/Screen': { Screen: 'screen' },
    '../theme': { colors: {}, spacing: {}, radii: {} },
    '../safety/safetyClient': { useIsBlocked: () => false, blockUser: async () => {}, unblockUser: async () => {} },
    '../safety/BlockUserSheet': { BlockUserSheet: () => null },
    '../safety/ReportUserModal': { ReportUserModal: () => null },
  };
  return { mocks, routes, render: (component, props) => { cursor = 0; return component(props); },
    flush: () => effects.splice(0).forEach((effect) => effect()) };
}
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}

test('a profile link opens the exact participant without activating its enclosing ride card', () => {
  const h = harness();
  const { PublicProfileLink } = load('../src/profiles/PublicProfileLink.tsx', h.mocks);
  const tree = h.render(PublicProfileLink, { participantId: 'driver-id', name: 'Alex' });
  let stopped = false;
  tree.props.onPress({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(h.routes[0].pathname, '/profile/[participantId]');
  assert.equal(h.routes[0].params.participantId, 'driver-id');
  assert.equal(h.routes[0].params.name, 'Alex');
});

test('the live chat header opens the Firebase profile without changing conversation identity or history', () => {
  const h = harness();
  Object.assign(h.mocks, {
    '../profiles/PublicProfileLink': load('../src/profiles/PublicProfileLink.tsx', h.mocks),
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'rider' } }) },
    './chatClient': { useChat: () => ({ thread: { participantIds: ['driver', 'rider'], names: { driver: 'Alex' } },
      messages: [{ id: 'existing-text', text: 'See you', senderId: 'rider', sentAt: 1 }] }) },
    './chatModel': { chatPartner }, './ChatTripSheet': { ChatTripSheet: 'trip' },
    './ChatContextCard': { ChatContextCard: 'context' }, './ChatTimelineCard': { ChatTimelineCard: 'request' },
    '../screens/ConversationScreen': { ConversationScreen: 'conversation' },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date() }) },
    './chatPresentation': { formatBubbleTime: () => '', formatThreadTimestamp: () => '', getThreadBadge: () => null },
  });
  const { LiveChatScreen } = load('../src/chat/LiveChatScreens.tsx', h.mocks);
  const before = h.render(LiveChatScreen, { chatId: 'chat' }).props.children[0];
  before.props.onOpenProfile();
  assert.equal(h.routes[0].params.participantId, 'driver');
  const after = h.render(LiveChatScreen, { chatId: 'chat' }).props.children[0];
  assert.equal(after.key, before.key);
  assert.equal(after.props.conversation.messages[0].id, 'existing-text');
});

test('the real match sheet dismisses before opening the selected person’s profile on iOS', () => {
  const h = harness();
  const match = { driverId: 'driver', riderId: 'rider', role: 'driver', plan: {}, metrics: {} };
  Object.assign(h.mocks, {
    '../profiles/PublicProfileLink': { PublicProfileLink: 'profile-link', openPublicProfile: (id) => h.routes.push(id) },
    '../chat/chatClient': {}, '../payments/components/PriceTag': { PriceTag: 'price', PriceBreakdown: 'breakdown' },
    '../commute/commuteModel': { dayModeLabels: {}, METERS_PER_MILE: 1609 },
    '../mvp/rideRequestModel': { findTripRequest: () => undefined }, '../mvp/ridePresentation': presentation,
    '../routing/types': { trafficForecastIsStale: () => false },
    '../mvp/components/CancelRideButton': { CancelRideButton: 'cancel', RideCancellationNotice: 'notice' },
    './matchPresentation': { MATCH_PAGE_SIZES: [5], matchedPeople: () => [{ id: 'driver', name: 'Alex', area: {}, options: [match] }],
      matchPage: (people) => ({ people, page: 0, pages: 1 }) },
  });
  const { CommuteMatchesSheet } = load('../src/calendar/CommuteMatchesSheet.tsx', h.mocks);
  let closed = 0;
  const props = { date: '2026-11-02', mode: 'ride', uid: 'rider', requests: [], onClose: () => closed++ };
  const before = h.render(CommuteMatchesSheet, props);
  const link = nodes(before).find((node) => node.type === 'profile-link');
  assert.equal(link.props.participantId, 'driver');
  link.props.onOpen();
  assert.equal(h.routes.length, 0);
  const dismissing = h.render(CommuteMatchesSheet, props);
  assert.equal(dismissing.props.visible, false);
  dismissing.props.onDismiss();
  assert.equal(closed, 1);
  assert.deepEqual(h.routes, ['driver']);
});

for (const uid of ['driver', 'rider']) test(`a live request card opens the other participant for the ${uid}`, () => {
  const h = harness();
  Object.assign(h.mocks, {
    '../../profiles/PublicProfileLink': { PublicProfileLink: 'profile-link' },
    '../../components/Avatar': { Avatar: 'avatar' }, '../../components/Card': { Card: 'card' },
    '../../components/AppButton': { AppButton: 'button' }, '../../theme': { colors: {}, spacing: {} },
    '../rideRequestModel': { requestCanCancel: () => false, requestRecipient: () => 'driver' }, '../ridePresentation': presentation,
    '../../payments/pricing': {}, './CancelRideButton': { RideCancellationNotice: 'notice' },
  });
  const { LiveRequestCard } = load('../src/mvp/components/LiveRequestCard.tsx', h.mocks);
  const ride = { driverId: 'driver', riderId: 'rider', driverName: 'Alex', riderName: 'Maya', localDate: '2026-11-02',
    status: 'PENDING', plan: { departure: 100, pickup: 200, riderDestinationArrival: 300 }, metrics: { driverExtraDurationSeconds: 1 } };
  const tree = h.render(LiveRequestCard, { ride, uid, now: 1 });
  assert.equal(nodes(tree).find((node) => node.type === 'profile-link').props.participantId, uid === 'driver' ? 'rider' : 'driver');
});

test('changing profile targets hides the previous person immediately and ignores callbacks after unsubscribe', () => {
  const h = harness();
  const listeners = [];
  Object.assign(h.mocks, {
    'firebase/firestore': { doc: (_db, _path, id) => id, onSnapshot: (id, value, error) => {
      const listener = { id, value, error, stopped: false }; listeners.push(listener);
      return () => { listener.stopped = true; };
    } },
    '../firebase/firebase': { getFirebaseFirestore: () => ({}) }, './publicProfiles': { parsePublicProfile },
  });
  const { usePublicProfile } = load('../src/profiles/profileClient.ts', h.mocks);
  const snapshot = (id) => ({ exists: () => true, data: () => ({ schemaVersion: 1, ownerId: id, displayName: id, role: 'rider' }) });
  assert.equal(h.render(usePublicProfile, 'alice'), null); h.flush();
  listeners[0].value(snapshot('alice'));
  assert.equal(h.render(usePublicProfile, 'alice').displayName, 'alice');
  assert.equal(h.render(usePublicProfile, 'bob'), null); h.flush();
  assert.equal(listeners[0].stopped, true);
  listeners[0].value(snapshot('alice'));
  assert.equal(h.render(usePublicProfile, 'bob'), null);
  listeners[1].value(snapshot('bob'));
  assert.equal(h.render(usePublicProfile, 'bob').displayName, 'bob');
});
