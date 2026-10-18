import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { findMatches, MatchingError } from '../../mobile/src/mvp/service';
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
import { DemoBusyError, DEMO_CANDIDATE_LIMIT, FUNCTION_TIMEOUT_SECONDS } from './demoRouting';
import { eligible, load, withMatchingRouting } from './matchingRuntime';
export { createRideRequest, respondToRideRequest, cancelRideRequest } from './rideRequests';

initializeApp();
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
    try {
      return await withMatchingRouting(async (routing) => {
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
              return Promise.all(snapshot.docs.map((document) => load(document.id))).then((items) =>
                items.filter((item) => item !== null),
              );
            },
          },
          routing,
          Math.floor(Date.now() / 1000),
          DEMO_CANDIDATE_LIMIT,
        );
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof DemoBusyError) throw new HttpsError('resource-exhausted', error.message);
      if (error instanceof MatchingError) throw new HttpsError(error.code, error.message);
      throw new HttpsError('unavailable', 'Matching is temporarily unavailable. Please retry.');
    }
  },
);

export { findCommuteMatches, setCommuteDay } from './calendarMatching';
export { saveVehicleDetails } from './vehicle';
export { estimateCommuteStart } from './commuteEstimate';
