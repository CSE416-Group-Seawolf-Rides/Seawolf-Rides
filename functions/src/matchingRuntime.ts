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
const routeUrl = defineString('OSRM_BASE_URL', {
  description: 'Authorized OSRM endpoint, without credentials.',
});
export const eligible = async (uid: string) => {
  try {
    const user = await getAuth().getUser(uid);
    return !user.disabled && user.emailVerified && /@stonybrook[.]edu$/.test(user.email ?? '');
  } catch {
    return false;
  }
};
export const load = async (uid: string): Promise<SavedParticipant | null> => {
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

export async function withMatchingRouting<T>(
  work: (routing: RoutingAdapter) => Promise<T>,
): Promise<T> {
  const endpoint = routeUrl.value();
  try {
    const url = new URL(endpoint);
    const local =
      process.env.FUNCTIONS_EMULATOR === 'true' &&
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1';
    if ((!local && endpoint !== 'https://router.project-osrm.org') || url.username || url.password)
      throw new Error('Invalid endpoint');
  } catch {
    throw new HttpsError('failed-precondition', 'Routing is not configured for this environment.');
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
    upstream,
    randomUUID(),
    work,
  );
}
