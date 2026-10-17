import type {
  RoutingAdapter,
  RoutingResult,
  RouteCoordinate,
} from '../../mobile/src/routing/types';

export const DEMO_CANDIDATE_LIMIT = 2;
export const FUNCTION_TIMEOUT_SECONDS = 120;
export const ROUTE_TIMEOUT_MS = 10_000;
export const ROUTING_BUDGET_MS = 55_000;
export const REQUEST_GAP_MS = 1_100;
export const MAX_PROVIDER_REQUESTS = 4;

export class DemoBusyError extends Error {}
export interface DemoRoutingStore {
  // Atomic, shared across all instances/revisions. A crashed owner never expires automatically.
  acquire(owner: string): Promise<boolean>;
  release(owner: string): Promise<void>;
  cached(key: string): Promise<RoutingResult | null>;
  cache(key: string, result: RoutingResult): Promise<void>;
}
export interface SchedulerClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
const clock: SchedulerClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
const exhausted = (): RoutingResult => ({
  status: 'FAILURE',
  code: 'TIMEOUT',
  message: 'The limited demo routing budget was reached. Please retry.',
  retryable: true,
});

/** All routes (including concurrent candidate calls) are serialized under one distributed owner. */
export async function withDemoRouting<T>(
  store: DemoRoutingStore,
  upstream: RoutingAdapter,
  owner: string,
  work: (adapter: RoutingAdapter) => Promise<T>,
  timer = clock,
): Promise<T> {
  if (!(await store.acquire(owner)))
    throw new DemoBusyError('Demo routing is busy. Wait a few seconds and retry.');
  const started = timer.now();
  let completed: number | null = null;
  let calls = 0;
  let tail: Promise<void> = Promise.resolve();
  const adapter: RoutingAdapter = {
    route(points: readonly RouteCoordinate[]) {
      const key = JSON.stringify(points);
      const request = tail.then(async () => {
        if (timer.now() - started >= ROUTING_BUDGET_MS) return exhausted();
        const cached = await store.cached(key);
        if (cached) return cached;
        if (calls >= MAX_PROVIDER_REQUESTS) return exhausted();
        if (completed !== null)
          await timer.sleep(Math.max(0, completed + REQUEST_GAP_MS - timer.now()));
        // Leave enough time for the complete upstream timeout. No unbounded waiter queue.
        if (timer.now() - started + ROUTE_TIMEOUT_MS > ROUTING_BUDGET_MS) return exhausted();
        calls++;
        let result: RoutingResult;
        try {
          result = await upstream.route(points);
        } finally {
          completed = timer.now();
        }
        if (result.status === 'SUCCESS') await store.cache(key, result);
        return result;
      });
      tail = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    },
  };
  try {
    return await work(adapter);
  } finally {
    // A failed caller must not unlock while a route it queued is still in flight.
    await tail;
    await store.release(owner);
  }
}
