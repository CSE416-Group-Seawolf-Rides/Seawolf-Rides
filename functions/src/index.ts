import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { findMatches, MatchingError, type SavedParticipant } from '../../mobile/src/mvp/service';
import { createOsrmRoutingAdapter } from '../../mobile/src/routing/osrmAdapter';

initializeApp();
const routeUrl = defineString('OSRM_BASE_URL', {
  description: 'HTTPS OSRM endpoint authorized for this environment (no credentials in URL).',
});
const eligible = async (uid: string) => {
  try {
    const user = await getAuth().getUser(uid);
    return !user.disabled && user.emailVerified && /@stonybrook[.]edu$/.test(user.email ?? '');
  } catch {
    return false;
  }
};
const load = async (uid: string): Promise<SavedParticipant | null> => {
  const db = getFirestore();
  const [setup, profile, commute, verified] = await Promise.all([
    db.doc(`matchingSetups/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/commutes/primary`).get(),
    eligible(uid),
  ]);
  return {
    uid,
    eligible: verified,
    setup: setup.data(),
    profile: profile.data(),
    commute: commute.data(),
  };
};
export const findCompatibleDrivers = onCall(
  { region: 'us-central1', timeoutSeconds: 300, maxInstances: 3, concurrency: 4 },
  async (request) => {
    if (!request.auth || !(await eligible(request.auth.uid)))
      throw new HttpsError('permission-denied', 'Sign in with a verified Stony Brook account.');
    const endpoint = routeUrl.value();
    try {
      const url = new URL(endpoint);
      const localEmulator =
        process.env.FUNCTIONS_EMULATOR === 'true' &&
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1';
      if ((!localEmulator && url.protocol !== 'https:') || url.username || url.password)
        throw new Error('Invalid endpoint');
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Routing is not configured for this environment.',
      );
    }
    try {
      return await findMatches(
        request.auth.uid,
        request.data,
        {
          load,
          findDrivers: async (campusLot, weekday, limit) => {
            const snapshot = await getFirestore()
              .collection('matchingSetups')
              .where('active', '==', true)
              .where('optIn', '==', true)
              .where('mode', '==', 'driver')
              .where('campusLot', '==', campusLot)
              .where('weekdays', 'array-contains', weekday)
              .orderBy(FieldPath.documentId())
              .limit(limit)
              .get();
            return Promise.all(snapshot.docs.map((document) => load(document.id))).then((items) =>
              items.filter((item) => item !== null),
            );
          },
        },
        createOsrmRoutingAdapter({ baseUrl: endpoint }),
      );
    } catch (error) {
      if (error instanceof MatchingError) throw new HttpsError(error.code, error.message);
      // Never send document contents, provider URLs or coordinates in an error response.
      throw new HttpsError('unavailable', 'Matching is temporarily unavailable. Please retry.');
    }
  },
);
