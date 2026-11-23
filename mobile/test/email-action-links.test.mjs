import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECK_SPAM_HINT,
  continueUrlFor,
  isContinueUrlRejection,
  isRateLimited,
  sendWithContinueLink,
  unverifiedSignInMessage,
} from '../src/auth/emailActionLinks.ts';
import { emailContinueUrl } from '../src/auth/emailContinueUrl.ts';

const firebaseError = (code) => Object.assign(new Error(code), { code });

test('the continue link points at the site sign-in page for http(s) origins only', () => {
  assert.equal(continueUrlFor('https://seawolf-rides.web.app'), 'https://seawolf-rides.web.app/email');
  assert.equal(continueUrlFor('http://localhost:8081'), 'http://localhost:8081/email');
  assert.equal(continueUrlFor('file://'), undefined);
  assert.equal(continueUrlFor('null'), undefined);
  assert.equal(continueUrlFor(undefined), undefined);
  assert.equal(continueUrlFor('https://evil.example/path'), undefined);
});

test('the phone app sends plain emails without a continue link', () => {
  assert.equal(emailContinueUrl(), undefined);
});

test('a continue link is passed to Firebase when there is one', async () => {
  const calls = [];
  await sendWithContinueLink('https://seawolf-rides.web.app/email', async (settings) => {
    calls.push(settings);
  });
  assert.deepEqual(calls, [{ url: 'https://seawolf-rides.web.app/email' }]);
});

test('without a continue link the plain email is sent once', async () => {
  const calls = [];
  await sendWithContinueLink(undefined, async (settings) => {
    calls.push(settings);
  });
  assert.deepEqual(calls, [undefined]);
});

test('a refused continue link falls back to the plain email instead of failing sign-up', async () => {
  for (const code of ['auth/unauthorized-continue-uri', 'auth/invalid-continue-uri', 'auth/missing-continue-uri']) {
    const calls = [];
    await sendWithContinueLink('https://preview.example/email', async (settings) => {
      calls.push(settings);
      if (settings) throw firebaseError(code);
    });
    assert.deepEqual(calls, [{ url: 'https://preview.example/email' }, undefined], code);
  }
});

test('other email errors are not hidden by the fallback', async () => {
  const calls = [];
  await assert.rejects(
    sendWithContinueLink('https://seawolf-rides.web.app/email', async (settings) => {
      calls.push(settings);
      throw firebaseError('auth/too-many-requests');
    }),
    { code: 'auth/too-many-requests' },
  );
  assert.equal(calls.length, 1);
  assert.equal(isContinueUrlRejection(firebaseError('auth/network-request-failed')), false);
  assert.equal(isContinueUrlRejection(null), false);
});

test('email notices tell people to check spam', () => {
  assert.match(CHECK_SPAM_HINT, /spam or junk/);
});

test('only Firebase too-many-requests counts as a throttled email', () => {
  assert.equal(isRateLimited(firebaseError('auth/too-many-requests')), true);
  assert.equal(isRateLimited(firebaseError('auth/network-request-failed')), false);
  assert.equal(isRateLimited(firebaseError('auth/unauthorized-continue-uri')), false);
  assert.equal(isRateLimited(null), false);
  assert.equal(isRateLimited('auth/too-many-requests'), false);
});

test('signing in before verifying explains the email instead of "too many attempts"', () => {
  const resent = unverifiedSignInMessage('wolfie@stonybrook.edu', true);
  assert.match(resent, /Verify your Stony Brook email/);
  assert.match(resent, /new verification link to wolfie@stonybrook\.edu/);
  assert.match(resent, /spam or junk/);

  const throttled = unverifiedSignInMessage('wolfie@stonybrook.edu', false);
  assert.match(throttled, /Verify your Stony Brook email/);
  assert.match(throttled, /already sent a link to wolfie@stonybrook\.edu/);
  assert.match(throttled, /spam or junk/);
  assert.match(throttled, /few minutes/);
  assert.doesNotMatch(throttled, /too many attempts/i);
});
