import { collection, deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';

import { validateEmergencyContact, validateProblemReport, type EmergencyContact, type ProblemReport } from './accountModel';

const contactDocument = (database: Firestore, uid: string) => doc(database, 'users', uid, 'safety', 'emergencyContact');

export async function loadEmergencyContact(database: Firestore, uid: string): Promise<EmergencyContact | null> {
  const snapshot = await getDocFromServer(contactDocument(database, uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (typeof data.name !== 'string' || typeof data.phone !== 'string' || typeof data.relationship !== 'string') {
    throw new Error('Couldn’t read your saved contact.');
  }
  return validateEmergencyContact({ name: data.name, phone: data.phone, relationship: data.relationship });
}

export async function saveEmergencyContact(database: Firestore, uid: string, input: EmergencyContact): Promise<void> {
  await setDoc(contactDocument(database, uid), {
    schemaVersion: 1,
    ...validateEmergencyContact(input),
    updatedAt: serverTimestamp(),
  });
}

export async function removeEmergencyContact(database: Firestore, uid: string): Promise<void> {
  await deleteDoc(contactDocument(database, uid));
}

export function newProblemReportId(database: Firestore): string {
  return doc(collection(database, 'supportReports')).id;
}

export async function submitProblemReport(database: Firestore, uid: string, id: string, input: ProblemReport): Promise<void> {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw new Error('Couldn’t create a report reference. Reopen this page and try again.');
  await setDoc(doc(database, 'supportReports', id), {
    schemaVersion: 1,
    reporterId: uid,
    ...validateProblemReport(input),
    status: 'NEW',
    createdAt: serverTimestamp(),
  });
}
