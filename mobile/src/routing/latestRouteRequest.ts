import type { RouteCoordinate, RoutingAdapter, RoutingResult } from './types';

export type LatestRouteRequestResult =
  | { status: 'CURRENT'; result: RoutingResult }
  | { status: 'STALE' };

/** Keeps only the newest request authoritative and aborts work that is no longer useful. */
export class LatestRouteRequest {
  private generation = 0;
  private controller: AbortController | null = null;

  async run(
    adapter: RoutingAdapter,
    coordinates: readonly RouteCoordinate[],
  ): Promise<LatestRouteRequestResult> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const result = await adapter.route(coordinates, { signal: controller.signal });
    if (generation !== this.generation) return { status: 'STALE' };
    this.controller = null;
    return { status: 'CURRENT', result };
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
