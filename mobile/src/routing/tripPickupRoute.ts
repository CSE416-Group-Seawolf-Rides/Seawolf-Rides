import { localMinuteToEpochSeconds, NORMAL_MATCHING_TIME_ZONE } from '../matching/driverRecommendations';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';
import type { IncomingRequest, Trip } from '../rides/rideModel';
import type { RoadRoute, RouteCoordinate, RoutingAdapter, RoutingResult } from './types';

export const TRIP_PICKUP_ROUTE_CONCURRENCY = 2;
export const TRIP_PICKUP_MAX_PROPOSED_STOPS = 4;
export const TRIP_PICKUP_MAX_SNAP_METERS = 75;

export interface TripPickupStop {
  riderId: string;
  riderName: string;
  label: string;
  coordinate: RouteCoordinate;
  pickupWindow: IncomingRequest['pickupWindow'];
  campusArrivalDeadlineMinutes: number;
  serviceSeconds: number | null;
}

export interface TripPickupManifest {
  tripId: string;
  localDate: string;
  direction: 'TO_CAMPUS';
  campus: { label: string; coordinate: RouteCoordinate };
  stops: TripPickupStop[];
  missingPickupRiders: { id: string; name: string }[];
  acceptedRiderIds: string[];
  agreedOrderIds: string[] | null;
}

export interface TripPickupRouteResult {
  route: RoadRoute;
  orderedStops: TripPickupStop[];
  orderKind: 'AGREED' | 'PROPOSED';
  alternativesCompared: number;
}

export function resolveTripPickupSelection(
  trips: readonly Trip[],
  selection: { tripId?: string; date?: string; direction?: string },
): Trip | null {
  if (!selection.tripId || selection.date !== selection.tripId || selection.direction !== 'TO_CAMPUS') return null;
  return trips.find((trip) => (
    trip.id === selection.tripId
    && !trip.skipped
    && ((trip.kind === 'drive' && trip.arriveBy !== null) || Boolean(trip.proposal))
  )) ?? null;
}

export type TripPickupSchedule =
  | { status: 'INCOMPLETE'; messages: string[] }
  | { status: 'CONFLICT'; messages: string[]; pickupEpochs: Record<string, number>; campusEpoch: number }
  | { status: 'VERIFIED'; pickupEpochs: Record<string, number>; campusEpoch: number };

export function buildTripPickupManifest(trip: Trip): TripPickupManifest | null {
  if (trip.proposal) {
    const proposal = trip.proposal;
    return {
      tripId: trip.id,
      localDate: proposal.occurrence.localDate,
      direction: 'TO_CAMPUS',
      campus: {
        label: proposal.agreed.campusDropoff.label,
        coordinate: { ...proposal.agreed.campusDropoff.coordinate },
      },
      stops: [{
        riderId: proposal.proposalId,
        riderName: 'Your pickup',
        label: proposal.agreed.pickup.label,
        coordinate: { ...proposal.agreed.pickup.coordinate },
        pickupWindow: {
          earliest: epochMinute(proposal.agreed.riderPickupWindow.earliest, proposal.occurrence.timeZone),
          latest: epochMinute(proposal.agreed.riderPickupWindow.latest, proposal.occurrence.timeZone),
        },
        campusArrivalDeadlineMinutes: epochMinute(
          proposal.agreed.riderDestinationArrivalWindow.latest - proposal.agreed.egressWalkSeconds,
          proposal.occurrence.timeZone,
        ),
        serviceSeconds: proposal.agreed.pickupServiceSeconds,
      }],
      missingPickupRiders: [],
      acceptedRiderIds: [proposal.proposalId],
      agreedOrderIds: [proposal.proposalId],
    };
  }
  if (trip.kind !== 'drive' || trip.arriveBy === null) return null;
  const campus = getCampusDestinationMapLocation(trip.campusLot);
  const accepted = uniqueAcceptedRiders(trip.riders ?? []);
  const stops: TripPickupStop[] = [];
  const missingPickupRiders: { id: string; name: string }[] = [];
  for (const rider of accepted) {
    const proposal = rider.proposal;
    const confirmedPickup = proposal?.agreed.pickup ?? rider.confirmedPickup;
    if (!confirmedPickup) {
      missingPickupRiders.push({ id: rider.id, name: rider.riderName });
      continue;
    }
    stops.push({
      riderId: rider.id,
      riderName: rider.riderName,
      label: confirmedPickup.label,
      coordinate: { ...confirmedPickup.coordinate },
      pickupWindow: proposal ? {
        earliest: epochMinute(proposal.agreed.riderPickupWindow.earliest, proposal.occurrence.timeZone),
        latest: epochMinute(proposal.agreed.riderPickupWindow.latest, proposal.occurrence.timeZone),
      } : rider.pickupWindow ? { ...rider.pickupWindow } : undefined,
      campusArrivalDeadlineMinutes: proposal
        ? epochMinute(proposal.agreed.riderDestinationArrivalWindow.latest - proposal.agreed.egressWalkSeconds, proposal.occurrence.timeZone)
        : rider.arriveBy,
      serviceSeconds: proposal
        ? proposal.agreed.pickupServiceSeconds
        : Number.isInteger(rider.pickupServiceSeconds) && rider.pickupServiceSeconds! >= 0 ? rider.pickupServiceSeconds! : null,
    });
  }
  const storedOrder = trip.routingPoints?.stops?.map((stop) => stop.riderRequestId).filter((id): id is string => typeof id === 'string') ?? [];
  const acceptedIds = accepted.map((rider) => rider.id);
  const agreedOrderIds = storedOrder.length === acceptedIds.length && new Set(storedOrder).size === acceptedIds.length && acceptedIds.every((id) => storedOrder.includes(id)) ? storedOrder : null;
  return {
    tripId: trip.id,
    localDate: trip.id,
    direction: 'TO_CAMPUS',
    campus: { label: campus.title, coordinate: { ...campus.coordinate } },
    stops,
    missingPickupRiders,
    acceptedRiderIds: acceptedIds,
    agreedOrderIds,
  };
}

function epochMinute(epochSeconds: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochSeconds * 1000));
  return Number(parts.find((part) => part.type === 'hour')?.value) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value);
}

function uniqueAcceptedRiders(riders: readonly IncomingRequest[]): IncomingRequest[] {
  const seen = new Set<string>();
  return riders.filter((rider) => {
    if (rider.status !== 'accepted' || seen.has(rider.id)) return false;
    seen.add(rider.id);
    return true;
  });
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [Array.from(values)];
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
}

async function mapWithConcurrency<T, U>(values: readonly T[], concurrency: number, worker: (value: T) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(values.length);
  let next = 0;
  async function run() { while (next < values.length) { const index = next++; results[index] = await worker(values[index]); } }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, run));
  return results;
}

export async function calculateTripPickupRoute(options: {
  adapter: RoutingAdapter;
  manifest: TripPickupManifest;
  origin: RouteCoordinate;
  signal?: AbortSignal;
  concurrency?: number;
  maxSnapMeters?: number;
}): Promise<TripPickupRouteResult> {
  const { manifest } = options;
  if (manifest.missingPickupRiders.length > 0) throw new Error('Every accepted rider needs a confirmed pickup before routing.');
  if (manifest.stops.length === 0) throw new Error('This trip has no accepted pickup stops.');
  if (!manifest.agreedOrderIds && manifest.stops.length > TRIP_PICKUP_MAX_PROPOSED_STOPS) throw new Error(`Confirm an order before routing more than ${TRIP_PICKUP_MAX_PROPOSED_STOPS} pickups.`);
  const byId = new Map(manifest.stops.map((stop) => [stop.riderId, stop]));
  const orders = manifest.agreedOrderIds
    ? [manifest.agreedOrderIds.map((id) => byId.get(id)!).filter(Boolean)]
    : permutations(manifest.stops);
  const attempts = await mapWithConcurrency(orders, options.concurrency ?? TRIP_PICKUP_ROUTE_CONCURRENCY, async (orderedStops) => {
    const coordinates = [options.origin, ...orderedStops.map((stop) => stop.coordinate), manifest.campus.coordinate];
    const result = await options.adapter.route(coordinates, { signal: options.signal });
    if (result.status === 'FAILURE') return { orderedStops, result, usable: false as const };
    const pickupSnaps = result.route.snappedWaypoints.slice(1, -1);
    const usable = result.route.legs.length === orderedStops.length + 1 && pickupSnaps.length === orderedStops.length && pickupSnaps.every((point) => point.distanceMeters <= (options.maxSnapMeters ?? TRIP_PICKUP_MAX_SNAP_METERS));
    return { orderedStops, result, usable };
  });
  const successful = attempts.filter((attempt): attempt is typeof attempt & { result: Extract<RoutingResult, { status: 'SUCCESS' }>; usable: true } => attempt.usable && attempt.result.status === 'SUCCESS').sort((a, b) => a.result.route.durationSeconds - b.result.route.durationSeconds || a.orderedStops.map((stop) => stop.riderId).join('|').localeCompare(b.orderedStops.map((stop) => stop.riderId).join('|')));
  const best = successful[0];
  if (!best) {
    const failure = attempts.find((attempt) => attempt.result.status === 'FAILURE')?.result;
    throw new Error(failure?.status === 'FAILURE' ? failure.message : 'The provider did not return a usable ordered pickup route.');
  }
  return { route: best.result.route, orderedStops: best.orderedStops, orderKind: manifest.agreedOrderIds ? 'AGREED' : 'PROPOSED', alternativesCompared: orders.length };
}

export function evaluateTripPickupSchedule(options: {
  trip: Trip;
  result: TripPickupRouteResult;
  departureMinutes: number | null;
  timeZone?: string;
}): TripPickupSchedule {
  const missing: string[] = [];
  if (options.departureMinutes === null) missing.push('Enter a planned departure time.');
  for (const stop of options.result.orderedStops) {
    if (!stop.pickupWindow) missing.push(`${stop.riderName} has no confirmed pickup-ready window.`);
    if (stop.serviceSeconds === null) missing.push(`${stop.riderName} has no pickup service duration.`);
  }
  if (options.trip.arriveBy === null) missing.push('The driver has no campus arrival deadline.');
  if (missing.length > 0 || options.departureMinutes === null) return { status: 'INCOMPLETE', messages: missing };

  let cursor = localMinuteToEpochSeconds(options.trip.id, options.departureMinutes, options.timeZone ?? NORMAL_MATCHING_TIME_ZONE);
  const pickupEpochs: Record<string, number> = {};
  const conflicts: string[] = [];
  options.result.orderedStops.forEach((stop, index) => {
    cursor += Math.round(options.result.route.legs[index].durationSeconds);
    const window = stop.pickupWindow!;
    const earliest = localMinuteToEpochSeconds(options.trip.id, window.earliest, options.timeZone ?? NORMAL_MATCHING_TIME_ZONE);
    const latest = localMinuteToEpochSeconds(options.trip.id, window.latest, options.timeZone ?? NORMAL_MATCHING_TIME_ZONE);
    cursor = Math.max(cursor, earliest);
    pickupEpochs[stop.riderId] = cursor;
    if (cursor > latest) conflicts.push(`${stop.riderName} pickup falls after the confirmed ready window.`);
    cursor += stop.serviceSeconds!;
  });
  cursor += Math.round(options.result.route.legs[options.result.orderedStops.length].durationSeconds);
  const campusEpoch = cursor;
  const driverDeadline = localMinuteToEpochSeconds(options.trip.id, options.trip.arriveBy!, options.timeZone ?? NORMAL_MATCHING_TIME_ZONE);
  if (campusEpoch > driverDeadline) conflicts.push('Campus arrival is later than the driver trip deadline.');
  for (const stop of options.result.orderedStops) {
    const deadline = localMinuteToEpochSeconds(options.trip.id, stop.campusArrivalDeadlineMinutes, options.timeZone ?? NORMAL_MATCHING_TIME_ZONE);
    if (campusEpoch > deadline) conflicts.push(`${stop.riderName} would arrive after their campus deadline.`);
  }
  return conflicts.length > 0 ? { status: 'CONFLICT', messages: conflicts, pickupEpochs, campusEpoch } : { status: 'VERIFIED', pickupEpochs, campusEpoch };
}

export class LatestTripPickupRouteRequest {
  private generation = 0;
  private controller: AbortController | null = null;
  async run(calculate: (signal: AbortSignal) => Promise<TripPickupRouteResult>): Promise<{ status: 'CURRENT'; result: TripPickupRouteResult } | { status: 'STALE' }> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const result = await calculate(controller.signal);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'STALE' };
    this.controller = null;
    return { status: 'CURRENT', result };
  }
  cancel() { this.generation += 1; this.controller?.abort(); this.controller = null; }
}
