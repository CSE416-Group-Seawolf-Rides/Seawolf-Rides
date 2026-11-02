import type {
  RoadRoute,
  RouteCoordinate,
  RoutingAdapter,
  RoutingFailureCode,
  RoutingResult,
} from '../../mobile/src/routing/types';
import { isValidRouteCoordinate, TRAFFIC_ARRIVAL_TOLERANCE_SECONDS } from '../../mobile/src/routing/types';
const fail = (
  code: RoutingFailureCode,
  message: string,
  retryable = false,
): RoutingResult => ({ status: 'FAILURE', code, message, retryable });
const numeric = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function distance(a: RouteCoordinate, b: RouteCoordinate) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat = radians(b.latitude - a.latitude),
    lng = radians(b.longitude - a.longitude);
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(lat / 2) ** 2 +
            Math.cos(radians(a.latitude)) *
              Math.cos(radians(b.latitude)) *
              Math.sin(lng / 2) ** 2,
        ),
      ),
    )
  );
}
export function parseTomtomRoute(
  body: unknown,
  inputs: readonly RouteCoordinate[],
  departure: number | undefined,
  now: number,
  arrival?: number,
): RoutingResult {
  if ((departure === undefined) === (arrival === undefined) ||
      !Number.isSafeInteger(departure ?? arrival))
    return fail('MALFORMED_RESPONSE', 'Traffic routing needs a validated dated context.');
  if (!record(body) || !Array.isArray(body.routes) || !record(body.routes[0]))
    return fail('MALFORMED_RESPONSE', 'Traffic route data is unavailable.', true);
  const raw = body.routes[0];
  if (
    !record(raw.summary) ||
    !numeric(raw.summary.travelTimeInSeconds) ||
    !numeric(raw.summary.lengthInMeters) ||
    !Array.isArray(raw.legs) ||
    raw.legs.length !== inputs.length - 1
  )
    return fail('MALFORMED_RESPONSE', 'Traffic route totals are invalid.', true);
  if (raw.summary.travelTimeInSeconds === 0 && raw.summary.lengthInMeters !== 0)
    return fail('MALFORMED_RESPONSE', 'Traffic route totals are invalid.', true);
  const providerDeparture = Date.parse(String(raw.summary.departureTime)) / 1000;
  const providerArrival = Date.parse(String(raw.summary.arrivalTime)) / 1000;
  if (
    !Number.isFinite(providerDeparture) ||
    (departure !== undefined && Math.abs(providerDeparture - departure) > 1) ||
    (arrival !== undefined && Math.abs(providerArrival - arrival) > TRAFFIC_ARRIVAL_TOLERANCE_SECONDS) ||
    providerDeparture < now ||
    !Number.isFinite(providerArrival) ||
    Math.abs(providerArrival - providerDeparture - raw.summary.travelTimeInSeconds) > 2 ||
    !numeric(raw.summary.historicTrafficTravelTimeInSeconds)
  )
    return fail(
      'MALFORMED_RESPONSE',
      'The provider could not confirm the scheduled traffic context.',
      true,
    );
  const pointLists: RouteCoordinate[][] = [];
  const legs: RoadRoute['legs'] = [];
  for (const leg of raw.legs) {
    if (
      !record(leg) ||
      !record(leg.summary) ||
      !numeric(leg.summary.travelTimeInSeconds) ||
      !numeric(leg.summary.lengthInMeters) ||
      !Array.isArray(leg.points) ||
      leg.points.length < 2 ||
      !leg.points.every(isValidRouteCoordinate)
    )
      return fail('MALFORMED_RESPONSE', 'Traffic route legs are invalid.', true);
    for (const field of [
      'trafficDelayInSeconds',
      'noTrafficTravelTimeInSeconds',
      'historicTrafficTravelTimeInSeconds',
      'liveTrafficIncidentsTravelTimeInSeconds',
    ]) {
      if (leg.summary[field] !== undefined && !numeric(leg.summary[field]))
        return fail('MALFORMED_RESPONSE', 'Traffic route timing is invalid.', true);
    }
    if (
      leg.summary.travelTimeInSeconds === 0 &&
      (leg.summary.lengthInMeters !== 0 || distance(leg.points[0], leg.points.at(-1)!) > 1)
    )
      return fail('MALFORMED_RESPONSE', 'Traffic route legs are invalid.', true);
    pointLists.push(leg.points);
    legs.push({
      durationSeconds: leg.summary.travelTimeInSeconds,
      distanceMeters: leg.summary.lengthInMeters,
      summary: '',
      steps: [],
    });
    // Geometry belongs to the road result, not to the public match card.
  }
  const geometry = pointLists.flatMap((points, i) => (i ? points.slice(1) : points));
  const snaps = [
    pointLists[0][0],
    ...pointLists.map((points) => points[points.length - 1]),
  ];
  if (
    snaps.some((p, i) => distance(inputs[i], p) > 75) ||
    pointLists.some(
      (points, i) => i > 0 && distance(pointLists[i - 1].at(-1)!, points[0]) > 1,
    )
  )
    return fail(
      'MALFORMED_RESPONSE',
      'Traffic routing could not confirm the selected points.',
      true,
    );
  const totalSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  const totalMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  if (
    Math.abs(totalSeconds - raw.summary.travelTimeInSeconds) > 2 ||
    Math.abs(totalMeters - raw.summary.lengthInMeters) > 2
  )
    return fail(
      'MALFORMED_RESPONSE',
      'Traffic route totals disagree with its legs.',
      true,
    );
  return {
    status: 'SUCCESS',
    route: {
      geometry,
      durationSeconds: totalSeconds,
      distanceMeters: totalMeters,
      legs,
      provider: { id: 'tomtom', name: 'TomTom', baseUrl: 'https://api.tomtom.com' },
      snappedWaypoints: inputs.map((input, i) => ({
        input,
        snapped: snaps[i],
        distanceMeters: distance(input, snaps[i]),
        name: '',
      })),
      estimate: {
        model: 'TRAFFIC_FORECAST',
        departureEpochSeconds: providerDeparture,
        computedAtEpochSeconds: now,
      },
    },
  };
}
/** Server only. No API key, full request URL or raw provider errors reach a client/log. */
export function createTomtomRouting(options: {
  apiKey: string;
  timeoutMs: number;
  baseUrl?: string;
  allowTestLoopback?: boolean;
  fetchImplementation?: typeof fetch;
  now?: () => number;
}): RoutingAdapter {
  const request = options.fetchImplementation ?? fetch;
  let endpoint: string | null = null;
  try {
    const base = new URL(options.baseUrl ?? 'https://api.tomtom.com');
    if (
      !base.username &&
      !base.password &&
      !base.search &&
      !base.hash &&
      base.pathname === '/' &&
      (base.origin === 'https://api.tomtom.com' ||
        (options.allowTestLoopback &&
          base.protocol === 'http:' &&
          base.hostname === '127.0.0.1'))
    )
      endpoint = base.origin;
  } catch {
    /* Fail closed at the routing boundary. */
  }
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  return {
    timeDependent: true,
    async route(points, requestOptions) {
      const departure = requestOptions?.departureEpochSeconds;
      const arrival = requestOptions?.arrivalEpochSeconds;
      const target = departure ?? arrival;
      if (
        !endpoint ||
        !/^[A-Za-z0-9_-]{16,256}$/.test(options.apiKey) ||
        !Number.isFinite(options.timeoutMs) ||
        options.timeoutMs <= 0
      )
        return fail('CONFIGURATION_ERROR', 'Traffic routing is not configured.');
      if (points.length < 2 || points.length > 3 || !points.every(isValidRouteCoordinate))
        return fail('INVALID_COORDINATES', 'Choose valid traffic route points.');
      if (
        (departure === undefined) === (arrival === undefined) ||
        !Number.isSafeInteger(target) ||
        target! < now() ||
        target! > now() + 31 * 86400
      )
        return fail(
          'CONFIGURATION_ERROR',
          'Traffic routing needs exactly one future departure or arrival within 31 days.',
        );
      if (requestOptions?.signal?.aborted)
        return fail('CANCELLED', 'Traffic route cancelled.');
      const url = new URL(
        `${endpoint}/routing/1/calculateRoute/${points.map((p) => `${p.latitude},${p.longitude}`).join(':')}/json`,
      );
      url.search = new URLSearchParams({
        key: options.apiKey,
        ...(arrival !== undefined
          ? { arriveAt: new Date(arrival * 1000).toISOString() }
          : { departAt: new Date(departure! * 1000).toISOString() }),
        traffic: 'true',
        travelMode: 'car',
        routeType: 'fastest',
        computeBestOrder: 'false',
        routeRepresentation: 'polyline',
        computeTravelTimeFor: 'all',
      }).toString();
      const abort = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, options.timeoutMs);
      const cancel = () => abort.abort();
      requestOptions?.signal?.addEventListener('abort', cancel, { once: true });
      try {
        const response = await request(url, { signal: abort.signal, redirect: 'error' });
        if (!response.ok)
          return fail(
            'PROVIDER_ERROR',
            response.status === 429
              ? 'Traffic provider limit reached. Retry later.'
              : 'Traffic estimates are unavailable.',
            response.status === 429 || response.status >= 500,
          );
        const result = parseTomtomRoute(await response.json(), points, departure, now(), arrival);
        if (abort.signal.aborted)
          return fail(
            timedOut ? 'TIMEOUT' : 'CANCELLED',
            'Traffic route interrupted.',
            true,
          );
        return result;
      } catch {
        return fail(
          timedOut
            ? 'TIMEOUT'
            : requestOptions?.signal?.aborted
              ? 'CANCELLED'
              : 'NETWORK_ERROR',
          'Traffic estimates are unavailable.',
          true,
        );
      } finally {
        clearTimeout(timer);
        requestOptions?.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
