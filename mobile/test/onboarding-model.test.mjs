import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOnboardingProfile,
  emptyOnboardingDraft,
  getNextStep,
  getOnboardingFlow,
  getStepProgress,
} from '../src/onboarding/onboardingModel.ts';

test('everyone answers role, name, and whether to set up a commute now', () => {
  assert.deepEqual(getOnboardingFlow(emptyOnboardingDraft), ['role', 'name', 'plan']);
});

test('choosing "later" finishes onboarding right after the plan question', () => {
  const draft = { ...emptyOnboardingDraft, role: 'rider', plan: 'later' };

  assert.equal(getNextStep(draft, 'plan'), 'done');
});

test('riders who set up now build a commute without a seats step', () => {
  const draft = { ...emptyOnboardingDraft, role: 'rider', plan: 'now' };

  assert.deepEqual(getOnboardingFlow(draft), [
    'role', 'name', 'plan', 'start', 'campus', 'schedule', 'review',
  ]);
});

test('drivers who set up now are asked about seats before reviewing', () => {
  const draft = { ...emptyOnboardingDraft, role: 'driver', plan: 'now' };

  assert.equal(getNextStep(draft, 'schedule'), 'seats');
  assert.equal(getNextStep(draft, 'seats'), 'review');
  assert.equal(getNextStep(draft, 'review'), 'done');
});

test('progress moves forward one segment per step', () => {
  const draft = { ...emptyOnboardingDraft, role: 'rider', plan: 'later' };

  assert.deepEqual(getStepProgress(draft, 'role'), { from: 0, to: 1 / 4 });
  assert.deepEqual(getStepProgress(draft, 'plan'), { from: 2 / 4, to: 3 / 4 });
});

test('builds a profile with a trimmed first name and requires both answers', () => {
  assert.deepEqual(
    buildOnboardingProfile({ ...emptyOnboardingDraft, role: 'both', firstName: '  Wolfie ' }),
    { role: 'both', firstName: 'Wolfie' },
  );
  assert.throws(() => buildOnboardingProfile({ ...emptyOnboardingDraft, role: 'driver' }));
  assert.throws(() => buildOnboardingProfile({ ...emptyOnboardingDraft, firstName: 'Wolfie' }));
});
