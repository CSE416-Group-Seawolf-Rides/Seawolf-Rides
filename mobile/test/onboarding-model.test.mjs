import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOnboardingProfile,
  emptyOnboardingDraft,
  getNextStep,
  getStepProgress,
} from '../src/onboarding/onboardingModel.ts';

test('onboarding asks for a role, then a name, then finishes', () => {
  assert.equal(getNextStep('role'), 'name');
  assert.equal(getNextStep('name'), 'done');
});

test('progress grows each step and only completes on the final screen', () => {
  assert.equal(getStepProgress('role'), 1 / 3);
  assert.equal(getStepProgress('name'), 2 / 3);
});

test('builds a profile with a trimmed first name', () => {
  const profile = buildOnboardingProfile({
    ...emptyOnboardingDraft,
    role: 'both',
    firstName: '  Wolfie ',
  });

  assert.deepEqual(profile, { role: 'both', firstName: 'Wolfie' });
});

test('requires a role and a first name to finish', () => {
  assert.throws(() => buildOnboardingProfile({ ...emptyOnboardingDraft, role: 'driver' }));
  assert.throws(() => buildOnboardingProfile({ ...emptyOnboardingDraft, firstName: 'Wolfie' }));
});
