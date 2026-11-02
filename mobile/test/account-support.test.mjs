import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEmergencyContact, validateProblemReport, reportReference } from '../src/account/accountModel.ts';
import { searchHelp } from '../src/account/helpContent.ts';

test('emergency numbers are normalized for dialing without accepting URI commands', () => {
  assert.deepEqual(validateEmergencyContact({ name: '  Jane Lee  ', phone: '(631) 555-0123', relationship: ' Parent ' }), {
    name: 'Jane Lee', phone: '+16315550123', relationship: 'Parent',
  });
  assert.equal(validateEmergencyContact({ name: 'Jane', phone: '+44 20 7946 0958', relationship: '' }).phone, '+442079460958');
  for (const phone of ['911', '6315550123?body=secret', 'tel:+16315550123', '5555555555555555', '6315550123\n;123']) {
    assert.throws(() => validateEmergencyContact({ name: 'Jane', phone, relationship: '' }));
  }
});

test('a contact needs a name and bounded relationship', () => {
  for (const contact of [
    { name: ' ', phone: '6315550123', relationship: '' },
    { name: 'a'.repeat(81), phone: '6315550123', relationship: '' },
    { name: 'Jane', phone: '6315550123', relationship: 'a'.repeat(41) },
  ]) assert.throws(() => validateEmergencyContact(contact));
});

test('support reports require actionable text, a known topic and bounded device metadata', () => {
  const report = { category: 'matching', description: '  Search returned an error after I selected Tuesday.  ', appVersion: '0.1.0', platform: 'ios' };
  assert.equal(validateProblemReport(report).description, report.description.trim());
  for (const patch of [
    { category: 'admin' }, { description: '          ' }, { description: 'a'.repeat(2001) },
    { appVersion: '' }, { appVersion: 'a'.repeat(41) }, { platform: 'unknown' },
  ]) assert.throws(() => validateProblemReport({ ...report, ...patch }));
  assert.equal(reportReference('abcdefghijklmnopqrst'), 'SR-abcdefghijklmnopqrst');
});

test('help searches answers as well as questions and requires every search word', () => {
  assert.ok(searchHelp('  RETURN trip  ').some((article) => article.id === 'return'));
  assert.ok(searchHelp('country').length === 0);
  assert.ok(searchHelp('reference number').some((article) => article.id === 'data'));
  assert.equal(searchHelp('return zebranotfound').length, 0);
  assert.ok(searchHelp('').length >= 10);
});
