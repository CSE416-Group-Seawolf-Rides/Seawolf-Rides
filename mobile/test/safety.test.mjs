import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

import {
  REPORT_REASONS,
  isReportReason,
  parseBlockedUser,
  validateReportInput,
} from '../src/safety/safetyModel.ts';

const require = createRequire(import.meta.url);

function load(file, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
  });
  return module.exports;
}

function harness() {
  const state = [];
  const effects = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [
      state[index],
      (next) => {
        state[index] = typeof next === 'function' ? next(state[index]) : next;
      },
    ];
  };
  const react = {
    ...React,
    useState,
    useRef: (value) => useState(() => ({ current: value }))[0],
    useCallback: (fn) => fn,
    useEffect: (effect, deps) => {
      const index = cursor++;
      const old = state[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        effects.push(() => {
          old?.cleanup?.();
          state[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const native = {
    Pressable: 'press',
    Text: 'text',
    View: 'view',
    ScrollView: 'scroll',
    Modal: 'modal',
    ActivityIndicator: 'loading',
    TextInput: 'text-input',
    FlatList: 'flat-list',
    Alert: { alert: () => {} },
    KeyboardAvoidingView: 'keyboard-view',
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s) => s, absoluteFill: {} },
  };
  const routes = [];
  const mocks = {
    react,
    'react-native': native,
    'expo-router': { router: { push: (route) => routes.push(route), back: () => routes.push('back') } },
    'react-native-safe-area-context': {
      SafeAreaView: 'safe',
      useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'icon' },
    '../components/AppButton': { AppButton: 'button' },
    '../components/Avatar': { Avatar: 'avatar' },
    '../components/Card': { Card: 'card' },
    '../components/Screen': { Screen: 'screen' },
    '../components/ChoiceSheet': { ChoiceSheet: 'choice-sheet' },
    '../theme': { colors: { text: '#000', textMuted: '#666', error: '#900', surface: '#fff' }, spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }, radii: { sm: 10, md: 14, lg: 20, pill: 999 } },
    './safetyModel': { REPORT_REASONS },
    './safetyClient': {
      useBlockedUsers: () => ({ blocked: [], loaded: true, error: null }),
      unblockUser: async () => {},
      blockUser: async () => {},
      submitReport: async () => {},
      useIsBlocked: () => false,
    },
    '../safety/safetyClient': {
      useBlockedUsers: () => ({ blocked: [], loaded: true, error: null }),
      unblockUser: async () => {},
      blockUser: async () => {},
      submitReport: async () => {},
      useIsBlocked: () => false,
    },
    '../safety/BlockUserSheet': { BlockUserSheet: 'block-sheet' },
    '../safety/ReportUserModal': { ReportUserModal: 'report-modal' },
  };
  return {
    mocks,
    routes,
    render: (component, props) => {
      cursor = 0;
      return component(props);
    },
    flush: () => effects.splice(0).forEach((effect) => effect()),
  };
}

function nodes(node) {
  return React.isValidElement(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
    : [];
}

test('REPORT_REASONS contains required safety categories with descriptions', () => {
  assert.equal(REPORT_REASONS.length >= 6, true);
  const keys = REPORT_REASONS.map((r) => r.key);
  assert.equal(keys.includes('harassment'), true);
  assert.equal(keys.includes('unsafe_driving'), true);
  assert.equal(keys.includes('no_show'), true);
  assert.equal(keys.includes('inappropriate_behavior'), true);
  assert.equal(keys.includes('scam_or_fraud'), true);
  assert.equal(keys.includes('other'), true);
});

test('isReportReason correctly identifies valid and invalid reasons', () => {
  assert.equal(isReportReason('harassment'), true);
  assert.equal(isReportReason('unsafe_driving'), true);
  assert.equal(isReportReason('invalid_reason'), false);
  assert.equal(isReportReason(null), false);
  assert.equal(isReportReason(123), false);
});

test('parseBlockedUser parses valid Firestore document formats and handles timestamps', () => {
  const parsed = parseBlockedUser({
    targetId: 'bob',
    targetName: 'Bob SBU',
    createdAt: { toMillis: () => 1700000000000 },
  });
  assert.deepEqual(parsed, {
    targetId: 'bob',
    targetName: 'Bob SBU',
    createdAt: 1700000000000,
  });

  const parsedWithFallback = parseBlockedUser({ targetName: '' }, 'charlie');
  assert.equal(parsedWithFallback?.targetId, 'charlie');
  assert.equal(parsedWithFallback?.targetName, 'Stony Brook Commuter');

  assert.equal(parseBlockedUser(null), null);
  assert.equal(parseBlockedUser({ targetId: '' }), null);
});

test('validateReportInput validates inputs and enforces length bounds', () => {
  const valid = validateReportInput({
    targetId: 'target-1',
    targetName: 'Target Name',
    reason: 'harassment',
    details: 'Details description',
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.value.targetId, 'target-1');
    assert.equal(valid.value.reason, 'harassment');
    assert.equal(valid.value.details, 'Details description');
  }

  assert.equal(validateReportInput({ targetId: '' }).valid, false);
  assert.equal(validateReportInput({ targetId: 'u1', targetName: '', reason: 'harassment' }).valid, false);
  assert.equal(validateReportInput({ targetId: 'u1', targetName: 'Name', reason: 'bad_reason' }).valid, false);

  const longDetails = 'a'.repeat(501);
  const tooLong = validateReportInput({ targetId: 'u1', targetName: 'Name', reason: 'harassment', details: longDetails });
  assert.equal(tooLong.valid, false);
});

test('BlockedUsersScreen renders empty state when no users are blocked', () => {
  const h = harness();
  const { BlockedUsersScreen } = load('../src/safety/BlockedUsersScreen.tsx', h.mocks);
  const tree = h.render(BlockedUsersScreen, { currentUid: 'me', onBack: () => {} });
  const allNodes = nodes(tree);
  const emptyTitle = allNodes.find((n) => typeof n.props?.children === 'string' && n.props.children.includes('No Blocked People'));
  assert.notEqual(emptyTitle, undefined);
});

test('BlockedUsersScreen renders list with unblock button when users are blocked', () => {
  const h = harness();
  let unblockedId = null;
  h.mocks['./safetyClient'].useBlockedUsers = () => ({
    blocked: [{ targetId: 'bad-actor', targetName: 'Bad Actor', createdAt: 1700000000000 }],
    loaded: true,
    error: null,
  });
  h.mocks['./safetyClient'].unblockUser = async (uid, target) => {
    unblockedId = target;
  };
  const { BlockedUsersScreen } = load('../src/safety/BlockedUsersScreen.tsx', h.mocks);
  const tree = h.render(BlockedUsersScreen, { currentUid: 'me', onBack: () => {} });
  const allNodes = nodes(tree);
  const flatList = allNodes.find((n) => n.type === 'flat-list');
  assert.notEqual(flatList, undefined);
  assert.equal(flatList.props.data.length, 1);

  const row = flatList.props.renderItem({ item: flatList.props.data[0] });
  const rowNodes = nodes(row);
  const unblockPressable = rowNodes.find((n) => n.props?.accessibilityLabel === 'Unblock Bad Actor');
  assert.notEqual(unblockPressable, undefined);
  unblockPressable.props.onPress();
  assert.equal(unblockedId, 'bad-actor');
});

test('PublicProfileScreen renders safety card with block and report buttons when viewing another user', () => {
  const h = harness();
  const { PublicProfileScreen } = load('../src/screens/PublicProfileScreen.tsx', h.mocks);
  const profile = {
    participantId: 'other-user',
    displayName: 'Alex Rider',
    publicInfo: [],
    role: 'rider',
  };
  const tree = h.render(PublicProfileScreen, {
    profile,
    profileKnown: true,
    currentUid: 'my-user',
    onClose: () => {},
  });
  const allNodes = nodes(tree);
  const blockButton = allNodes.find((n) => n.props?.accessibilityLabel === 'Block Alex Rider');
  const reportButton = allNodes.find((n) => n.props?.accessibilityLabel === 'Report Alex Rider');
  assert.notEqual(blockButton, undefined);
  assert.notEqual(reportButton, undefined);
});

test('PublicProfileScreen hides safety card when viewing own profile', () => {
  const h = harness();
  const { PublicProfileScreen } = load('../src/screens/PublicProfileScreen.tsx', h.mocks);
  const profile = {
    participantId: 'my-user',
    displayName: 'My Profile',
    publicInfo: [],
    role: 'driver',
  };
  const tree = h.render(PublicProfileScreen, {
    profile,
    profileKnown: true,
    currentUid: 'my-user',
    onClose: () => {},
  });
  const allNodes = nodes(tree);
  const blockButton = allNodes.find((n) => n.props?.accessibilityLabel === 'Block My Profile');
  assert.equal(blockButton, undefined);
});
