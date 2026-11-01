import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

import { loadEmergencyContact, newProblemReportId, removeEmergencyContact, saveEmergencyContact, submitProblemReport } from '../src/account/accountRepository.ts';

let environment;
const token = { email: 'student@stonybrook.edu', email_verified: true };
const own = (uid = 'rider', claims = token) => environment.authenticatedContext(uid, claims).firestore();
const contactPath = 'users/rider/safety/emergencyContact';
const contact = { name: 'Jane Lee', phone: '(631) 555-0123', relationship: 'Parent' };
const report = { category: 'matching', description: 'The search failed after I selected a new date.', appVersion: '0.1.0', platform: 'ios' };

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: process.env.ACCOUNT_TEST_PROJECT ?? 'demo-seawolf-rides',
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await environment.cleanup(); });

test('contact saves and reloads independently of ride-validation document revisions', async () => {
  const database = own();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/rider'), { firstName: 'Rider', updatedAt: Timestamp.fromMillis(100) });
    await setDoc(doc(db, 'users/rider/commutes/primary'), { updatedAt: Timestamp.fromMillis(200) });
  });
  await saveEmergencyContact(database, 'rider', contact);
  assert.deepEqual(await loadEmergencyContact(database, 'rider'), { ...contact, phone: '+16315550123' });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'users/rider'))).data().updatedAt.toMillis(), 100);
    assert.equal((await getDoc(doc(db, 'users/rider/commutes/primary'))).data().updatedAt.toMillis(), 200);
  });
  await saveEmergencyContact(database, 'rider', { ...contact, name: 'Updated' });
  assert.equal((await loadEmergencyContact(database, 'rider')).name, 'Updated');
  await removeEmergencyContact(database, 'rider');
  assert.equal(await loadEmergencyContact(database, 'rider'), null);
});

test('other commuters, unverified users and signed-out clients cannot access emergency contacts', async () => {
  await saveEmergencyContact(own(), 'rider', contact);
  const unauthorized = [own('driver'), own('rider', { ...token, email_verified: false }), own('rider', { ...token, email: 'student@example.com' }), environment.unauthenticatedContext().firestore()];
  for (const db of unauthorized) {
    await assertFails(getDoc(doc(db, contactPath)));
    await assertFails(setDoc(doc(db, contactPath), { schemaVersion: 1, ...contact, phone: '+16315550123', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, contactPath)));
  }
  await assertFails(getDocs(collection(own('driver'), 'users/rider/safety')));
});

test('rules reject malformed contacts, extra fields, fake timestamps and alternate safety documents', async () => {
  const db = own();
  const valid = { schemaVersion: 1, ...contact, phone: '+16315550123', updatedAt: serverTimestamp() };
  for (const patch of [{ phone: 'tel:911' }, { phone: '+123' }, { name: '' }, { name: 'a'.repeat(81) }, { relationship: 'a'.repeat(41) }, { updatedAt: Timestamp.fromMillis(0) }, { visibleToEveryone: true }]) {
    await assertFails(setDoc(doc(db, contactPath), { ...valid, ...patch }));
  }
  await assertFails(setDoc(doc(db, 'users/rider/safety/other'), valid));
});

test('problem report creation returns an opaque reference with protected server metadata', async () => {
  const db = own();
  const id = newProblemReportId(db);
  assert.match(id, /^[A-Za-z0-9]{20}$/);
  await submitProblemReport(db, 'rider', id, report);
  await environment.withSecurityRulesDisabled(async (context) => {
    const data = (await getDoc(doc(context.firestore(), 'supportReports', id))).data();
    assert.equal(data.reporterId, 'rider');
    assert.equal(data.status, 'NEW');
    assert.equal(data.description, report.description);
    assert.ok(data.createdAt instanceof Timestamp);
    assert.deepEqual(Object.keys(data).sort(), ['schemaVersion', 'reporterId', 'category', 'description', 'appVersion', 'platform', 'status', 'createdAt'].sort());
  });
});

test('reports cannot be read, listed, overwritten, deleted or assigned a status by a client', async () => {
  const db = own();
  const id = newProblemReportId(db);
  await submitProblemReport(db, 'rider', id, report);
  for (const client of [db, own('driver'), environment.unauthenticatedContext().firestore()]) {
    const ref = doc(client, 'supportReports', id);
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(client, 'supportReports')));
    await assertFails(updateDoc(ref, { status: 'RESOLVED' }));
    await assertFails(deleteDoc(ref));
  }
  await assertFails(submitProblemReport(db, 'rider', id, report));
});

test('report rules reject forged identities, unknown fields, categories and invalid descriptions', async () => {
  const db = own();
  const valid = { schemaVersion: 1, reporterId: 'rider', ...report, status: 'NEW', createdAt: serverTimestamp() };
  for (const patch of [{ reporterId: 'driver' }, { status: 'RESOLVED' }, { category: 'admin' }, { description: ' '.repeat(20) }, { description: 'a'.repeat(2001) }, { description: 'short' }, { appVersion: '' }, { platform: 'server' }, { createdAt: Timestamp.fromMillis(0) }, { privateMessages: ['secret'] }]) {
    await assertFails(setDoc(doc(db, 'supportReports', newProblemReportId(db)), { ...valid, ...patch }));
  }
  await assertFails(setDoc(doc(db, 'supportReports/invalid-id'), valid));
  for (const unauthorized of [own('rider', { ...token, email_verified: false }), own('rider', { ...token, email: 'student@example.com' }), environment.unauthenticatedContext().firestore()]) {
    await assertFails(setDoc(doc(unauthorized, 'supportReports', newProblemReportId(db)), valid));
  }
});

test('administrator review can update status while keeping the client queue private', async () => {
  const db = own();
  const id = newProblemReportId(db);
  await submitProblemReport(db, 'rider', id, report);
  await environment.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), 'supportReports', id);
    await updateDoc(ref, { status: 'IN_PROGRESS', internalNote: 'Reproducing the search failure.' });
    assert.equal((await getDoc(ref)).data().status, 'IN_PROGRESS');
  });
  await assertFails(getDoc(doc(db, 'supportReports', id)));
});
