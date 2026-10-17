import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { findMatches, MatchingError, type SavedParticipant } from '../../mobile/src/mvp/service';
import {
  record,
  parseMatchingSetup,
  setupMatchesCommute,
  PUBLIC_POINTS,
  CAMPUS_POINTS,
} from '../../mobile/src/mvp/settings';
import {
  parseCommuteDocument,
  parseUserProfileDocument,
} from '../../mobile/src/persistence/userDataModel';
import {
  withDemoRouting,
  DemoBusyError,
  DEMO_CANDIDATE_LIMIT,
  FUNCTION_TIMEOUT_SECONDS,
  ROUTE_TIMEOUT_MS,
} from './demoRouting';
import { firestoreDemoRouting } from './firestoreDemoRouting';
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
  {
    region: 'us-central1',
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: 1,
    concurrency: 4,
  },
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
      const publicDemo = endpoint === 'https://router.project-osrm.org';
      if ((!localEmulator && !publicDemo) || url.username || url.password)
        throw new Error('Invalid endpoint');
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Routing is not configured for this environment.',
      );
    }
    try {
      const upstream = createOsrmRoutingAdapter({
        baseUrl: endpoint,
        timeoutMs: ROUTE_TIMEOUT_MS,
        allowScheduledPublicDemo: true,
      });
      return await withDemoRouting(
        firestoreDemoRouting(getFirestore(), endpoint),
        upstream,
        randomUUID(),
        async (routing) => {
          if (record(request.data) && request.data.action === 'PREVIEW') {
            if (
              Object.keys(request.data).some((key) => !['action', 'revision'].includes(key)) ||
              typeof request.data.revision !== 'string'
            )
              throw new MatchingError('invalid-argument', 'Supply your saved setup revision.');
            const saved = await load(request.auth!.uid);
            if (!saved?.eligible)
              throw new MatchingError('permission-denied', 'Your account is not eligible.');
            const setup = parseMatchingSetup(saved.setup, request.auth!.uid);
            const commute = parseCommuteDocument(saved.commute, request.auth!.uid);
            const profile = parseUserProfileDocument(saved.profile);
            if (
              !setup.active ||
              !setup.optIn ||
              setup.mode !== 'rider' ||
              setup.revision !== request.data.revision ||
              !setupMatchesCommute(setup, commute, profile.role)
            )
              throw new MatchingError(
                'failed-precondition',
                'Reload and save your current rider setup.',
              );
            const point = PUBLIC_POINTS.find((p) => p.id === setup.pointId)!;
            const campus = CAMPUS_POINTS.find((p) => p.id === setup.campusLot)!;
            return routing.route([point.coordinate, campus.coordinate]);
          }
          return findMatches(
            request.auth!.uid,
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
                return Promise.all(snapshot.docs.map((document) => load(document.id))).then(
                  (items) => items.filter((item) => item !== null),
                );
              },
            },
            routing,
            Math.floor(Date.now() / 1000),
            DEMO_CANDIDATE_LIMIT,
          );
        },
      );
    } catch (error) {
      if (error instanceof DemoBusyError) throw new HttpsError('resource-exhausted', error.message);
      if (error instanceof MatchingError) throw new HttpsError(error.code, error.message);
      // Never send document contents, provider URLs or coordinates in an error response.
      throw new HttpsError('unavailable', 'Matching is temporarily unavailable. Please retry.');
    }
  },
);
