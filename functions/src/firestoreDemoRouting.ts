import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { RoutingResult } from '../../mobile/src/routing/types';
import { REQUEST_GAP_MS, type DemoRoutingStore } from './demoRouting';

const CACHE_MS = 10 * 60_000;
/** Firestore readTime, not host clocks, arbitrates cross-instance admission/cooldown. */
export function firestoreDemoRouting(db: Firestore, endpoint: string): DemoRoutingStore {
  const gate = db.doc('_m3Routing/publicOsrm');
  const keyFor = (key: string) =>
    createHash('sha256')
      .update(endpoint + key)
      .digest('hex');
  return {
    acquire: (owner) =>
      db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(gate);
        const value = snapshot.data();
        const now = snapshot.readTime.toMillis();
        if (value?.owner || (value?.availableAtMs ?? 0) > now) return false;
        transaction.set(gate, { owner, acquiredAtMs: now, availableAtMs: 0 });
        return true;
      }),
    release: (owner) =>
      db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(gate);
        if (snapshot.data()?.owner !== owner) return;
        transaction.set(gate, {
          owner: null,
          availableAtMs: snapshot.readTime.toMillis() + REQUEST_GAP_MS,
        });
      }),
    cached: async (key) => {
      const snapshot = await db.doc(`_m3RouteCache/${keyFor(key)}`).get();
      const data = snapshot.data();
      return data?.expiresAtMs > snapshot.readTime.toMillis() && data?.result?.status === 'SUCCESS'
        ? (data.result as RoutingResult)
        : null;
    },
    cache: async (key, result) => {
      // Long route geometries must not exceed Firestore's document-size limit.
      if (Buffer.byteLength(JSON.stringify(result)) > 700_000) return;
      const reference = db.doc(`_m3RouteCache/${keyFor(key)}`);
      const snapshot = await reference.get();
      await reference.set({ expiresAtMs: snapshot.readTime.toMillis() + CACHE_MS, result });
    },
  };
}
