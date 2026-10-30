import { createTomtomRouting } from './tomtomRouting';
import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import type { SavedParticipant } from '../../mobile/src/mvp/service';
import type { RoutingAdapter } from '../../mobile/src/routing/types';
import { withDemoRouting, ROUTE_TIMEOUT_MS } from './demoRouting';
import { firestoreDemoRouting } from './firestoreDemoRouting';
import { createOsrmRoutingAdapter } from '../../mobile/src/routing/osrmAdapter';
import { parseUserProfileDocument, profileWithPublicDetails, toUserProfileDocument } from '../../mobile/src/persistence/userDataModel';
const routeUrl = defineString('OSRM_BASE_URL', {
  description: 'Authorized OSRM endpoint, without credentials.',
});
export const eligible = async (uid: string) => {
  try {
    const user = await getAuth().getUser(uid);
    return (
      !user.disabled && user.emailVerified && /@stonybrook[.]edu$/.test(user.email ?? '')
    );
  } catch {
    return false;
  }
};
export const load = async (uid: string): Promise<SavedParticipant | null> => {
  const db = getFirestore();
  const [setup, profile, commute, verified, publicProfile] = await Promise.all([
    db.doc(`matchingSetups/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/commutes/primary`).get(),
    eligible(uid),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);
  return {
    uid,
    eligible: verified,
    setup: setup.data(),
    profile: profile.exists
      ? toUserProfileDocument(profileWithPublicDetails(parseUserProfileDocument(profile.data()), publicProfile.data(), uid))
      : profile.data(),
    commute: commute.data(),
  };
};

/** Traffic is opt-in and only used by the fixed-departure calendar API. */
export function trafficRoutingEnabled() {
  return process.env.ROUTING_PROVIDER === 'tomtom';
}
export async function withMatchingRouting<T>(
  work: (routing: RoutingAdapter) => Promise<T>,
  scheduled = false,
): Promise<T> {
  if (
    scheduled &&
    process.env.ROUTING_PROVIDER &&
    !['osrm', 'tomtom'].includes(process.env.ROUTING_PROVIDER)
  )
    throw new HttpsError('failed-precondition', 'Unknown routing provider.');
  if (scheduled && trafficRoutingEnabled()) {
    if (
      process.env.FUNCTIONS_EMULATOR !== 'true' ||
      process.env.GCLOUD_PROJECT !== 'demo-seawolf-rides' ||
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new HttpsError(
        'failed-precondition',
        'Traffic routing is available only in the local demo.',
      );
    const key = process.env.TOMTOM_API_KEY ?? '';
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(key))
      throw new HttpsError(
        'failed-precondition',
        'Configure the backend TOMTOM_API_KEY before enabling traffic estimates.',
      );
    const baseUrl = process.env.TOMTOM_BASE_URL ?? 'https://api.tomtom.com';
    return withDemoRouting(
      firestoreDemoRouting(getFirestore(), 'tomtom-scheduled-v1:' + baseUrl, true),
      createTomtomRouting({
        apiKey: key,
        timeoutMs: ROUTE_TIMEOUT_MS,
        baseUrl,
        allowTestLoopback: true,
      }),
      randomUUID(),
      work,
    );
  }
  const endpoint = routeUrl.value();
  try {
    const url = new URL(endpoint);
    const local =
      process.env.FUNCTIONS_EMULATOR === 'true' &&
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1';
    if (
      (!local && endpoint !== 'https://router.project-osrm.org') ||
      url.username ||
      url.password
    )
      throw new Error('Invalid endpoint');
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Routing is not configured for this environment.',
    );
  }
  const upstream = createOsrmRoutingAdapter({
    baseUrl: endpoint,
    timeoutMs: ROUTE_TIMEOUT_MS,
    allowScheduledPublicDemo: true,
    fetchImplementation: (url, options) =>
      fetch(url, {
        ...options,
        headers: {
          'User-Agent':
            'SeawolfRides-M3-Demo/1.0 (+https://github.com/CSE416-Group-Seawolf-Rides/Seawolf-Rides)',
        },
      }),
  });
  return withDemoRouting(
    firestoreDemoRouting(getFirestore(), endpoint),
    {
      route: async (points, options) => {
        const result = await upstream.route(points, options);
        return result.status === 'SUCCESS'
          ? {
              ...result,
              route: {
                ...result.route,
                estimate: {
                  model: 'STATIC_ROAD',
                  computedAtEpochSeconds: Math.floor(Date.now() / 1000),
                },
              },
            }
          : result;
      },
    },
    randomUUID(),
    work,
  );
}
