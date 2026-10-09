import type { GeocodingAdapter, GeocodingResponse } from './types';

export type LatestGeocodingResult =
  | { status: 'CURRENT'; response: GeocodingResponse }
  | { status: 'STALE' };

export class LatestGeocodingSearch {
  private generation = 0;
  private controller: AbortController | null = null;

  async run(adapter: GeocodingAdapter, query: string): Promise<LatestGeocodingResult> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const response = await adapter.search(query, { signal: controller.signal });
    if (generation !== this.generation) return { status: 'STALE' };
    this.controller = null;
    return { status: 'CURRENT', response };
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
