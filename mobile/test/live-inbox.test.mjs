import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const nativeElement = (tag) => function NativeElement({ children, accessibilityLabel, accessibilityRole, onPress }) {
  return React.createElement(tag, {
    'aria-label': accessibilityLabel,
    role: accessibilityRole,
    onClick: onPress,
  }, children);
};

const View = nativeElement('div');
const Text = nativeElement('span');
const Pressable = nativeElement('button');
const ActivityIndicator = nativeElement('div');

const native = {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet: { create: (s) => s },
};

function loadComponent(file, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  });
  return module.exports;
}

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

test('LiveInboxScreen renders loading indicator while chats are loading', () => {
  const mocks = {
    react: React,
    'react-native': native,
    'expo-router': { router: {} },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: () => null },
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'me' } }) },
    '../components/Avatar': { Avatar: () => null },
    '../components/AppButton': { AppButton: ({ label }) => React.createElement('button', {}, label) },
    '../components/Card': { Card: View },
    '../components/Screen': { Screen: ({ title, children, eyebrow, subtitle }) => React.createElement('div', {}, eyebrow, title, subtitle, children) },
    '../profiles/PublicProfileLink': { openPublicProfile: () => {} },
    '../screens/ConversationScreen': { ConversationScreen: () => null },
    '../theme': { colors: {}, radii: {}, spacing: {} },
    './chatClient': { useChats: () => ({ loaded: false, error: null, items: [] }) },
    './chatModel': { chatPartner: () => 'other' },
    './chatPresentation': {
      formatThreadTimestamp: () => '9:30 AM',
      formatBubbleTime: () => '9:30 AM',
      getThreadBadge: () => null,
    },
    './ChatTimelineCard': { ChatTimelineCard: () => null },
    './ChatTripSheet': { ChatTripSheet: () => null },
    './ChatContextCard': { ChatContextCard: () => null },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date() }) },
    '../safety/safetyClient': { useIsBlocked: () => false },
  };

  const { LiveInboxScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', mocks);
  const tree = LiveInboxScreen();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Loading conversations…/);
  assert.match(html, /MESSAGES/);
  assert.match(html, /Inbox/);
});

test('LiveInboxScreen renders error alert when chat loading fails', () => {
  const mocks = {
    react: React,
    'react-native': native,
    'expo-router': { router: {} },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: () => null },
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'me' } }) },
    '../components/Avatar': { Avatar: () => null },
    '../components/AppButton': { AppButton: ({ label }) => React.createElement('button', {}, label) },
    '../components/Card': { Card: View },
    '../components/Screen': { Screen: ({ children }) => React.createElement('div', {}, children) },
    '../profiles/PublicProfileLink': { openPublicProfile: () => {} },
    '../screens/ConversationScreen': { ConversationScreen: () => null },
    '../theme': { colors: {}, radii: {}, spacing: {} },
    './chatClient': { useChats: () => ({ loaded: true, error: 'Could not load messages', items: [] }) },
    './chatModel': { chatPartner: () => 'other' },
    './chatPresentation': {
      formatThreadTimestamp: () => '',
      formatBubbleTime: () => '',
      getThreadBadge: () => null,
    },
    './ChatTimelineCard': { ChatTimelineCard: () => null },
    './ChatTripSheet': { ChatTripSheet: () => null },
    './ChatContextCard': { ChatContextCard: () => null },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date() }) },
    '../safety/safetyClient': { useIsBlocked: () => false },
  };

  const { LiveInboxScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', mocks);
  const html = renderToStaticMarkup(LiveInboxScreen());
  assert.match(html, /Could not load messages/);
});

test('LiveInboxScreen renders helpful empty state with explore action when no threads exist', () => {
  const pushed = [];
  const mocks = {
    react: React,
    'react-native': native,
    'expo-router': { router: { push: (dest) => pushed.push(dest) } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: () => null },
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'me' } }) },
    '../components/Avatar': { Avatar: () => null },
    '../components/AppButton': { AppButton: ({ label, onPress }) => React.createElement('button', { onClick: onPress }, label) },
    '../components/Card': { Card: View },
    '../components/Screen': { Screen: ({ children }) => React.createElement('div', {}, children) },
    '../profiles/PublicProfileLink': { openPublicProfile: () => {} },
    '../screens/ConversationScreen': { ConversationScreen: () => null },
    '../theme': { colors: {}, radii: {}, spacing: {} },
    './chatClient': { useChats: () => ({ loaded: true, error: null, items: [] }) },
    './chatModel': { chatPartner: () => 'other' },
    './chatPresentation': {
      formatThreadTimestamp: () => '',
      formatBubbleTime: () => '',
      getThreadBadge: () => null,
    },
    './ChatTimelineCard': { ChatTimelineCard: () => null },
    './ChatTripSheet': { ChatTripSheet: () => null },
    './ChatContextCard': { ChatContextCard: () => null },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date() }) },
    '../safety/safetyClient': { useIsBlocked: () => false },
  };

  const { LiveInboxScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', mocks);
  const tree = LiveInboxScreen();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /No messages yet/);
  assert.match(html, /Find a Commute Match/);

  const button = descendants(tree).find((n) => n.props?.label === 'Find a Commute Match');
  assert.ok(button);
  button.props.onPress();
  assert.deepEqual(pushed, ['/home']);
});

test('LiveInboxScreen renders thread list cards with partner name, role, timestamp, and navigates on tap', () => {
  const pushed = [];
  const sampleThread = {
    id: 'thread-123',
    participantIds: ['me', 'partner-uid'],
    names: { 'partner-uid': 'Sarah Commuter' },
    campusLabel: 'Tabler',
    updatedAt: 1793471400000,
    lastMessage: 'Sounds good! See you by the bus loop at 9am.',
    requestId: 'req-456',
  };

  const mocks = {
    react: React,
    'react-native': native,
    'expo-router': { router: { push: (dest) => pushed.push(dest) } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: () => null },
    '../auth/SessionProvider': { useSession: () => ({ user: { id: 'me' } }) },
    '../components/Avatar': { Avatar: ({ name, participantId, size }) => React.createElement('div', { 'data-name': name, 'data-pid': participantId, 'data-size': size }) },
    '../components/AppButton': { AppButton: ({ label }) => React.createElement('button', {}, label) },
    '../components/Card': { Card: View },
    '../components/Screen': { Screen: ({ children }) => React.createElement('div', {}, children) },
    '../profiles/PublicProfileLink': { openPublicProfile: () => {} },
    '../screens/ConversationScreen': { ConversationScreen: () => null },
    '../theme': { colors: {}, radii: {}, spacing: {} },
    './chatClient': { useChats: () => ({ loaded: true, error: null, items: [sampleThread] }) },
    './chatModel': { chatPartner: () => 'partner-uid' },
    './chatPresentation': {
      formatThreadTimestamp: () => '2:30 PM',
      formatBubbleTime: () => '2:30 PM',
      getThreadBadge: () => ({ label: 'Driver', isDriver: true }),
    },
    './ChatTimelineCard': { ChatTimelineCard: () => null },
    './ChatTripSheet': { ChatTripSheet: () => null },
    './ChatContextCard': { ChatContextCard: () => null },
    '../rides/useHomeClock': { useHomeClock: () => ({ now: new Date() }) },
    '../safety/safetyClient': { useIsBlocked: () => false },
  };

  const { LiveInboxScreen } = loadComponent('../src/chat/LiveChatScreens.tsx', mocks);
  const tree = LiveInboxScreen();
  const html = renderToStaticMarkup(tree);

  assert.match(html, /Sarah Commuter/);
  assert.match(html, /Driver/);
  assert.match(html, /2:30 PM/);
  assert.match(html, /Tabler Commute/);
  assert.match(html, /Sounds good! See you by the bus loop at 9am\./);
  assert.match(html, /Active Trip/);

  // Verify avatar received participantId
  const avatar = descendants(tree).find((n) => n.props?.participantId === 'partner-uid');
  assert.ok(avatar);
  assert.equal(avatar.props.name, 'Sarah Commuter');

  // Verify tap navigates to conversation
  const pressable = descendants(tree).find((n) => n.props?.accessibilityLabel === 'Chat with Sarah Commuter');
  assert.ok(pressable);
  pressable.props.onPress();
  assert.deepEqual(pushed, ['/inbox/thread-123']);
});
