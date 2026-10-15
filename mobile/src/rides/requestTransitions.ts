import type { CommuteSchedule, Weekday } from '../commute/commuteModel';
import { validateDatedRideProposal, type DatedRideProposalV1 } from './datedRideProposal';
import type { DriverOccurrenceOverride, DriverOffer, IncomingRequest, OutgoingRequest, RequestStatus } from './rideModel';
import { requestOccursOn, requestSeats, sharedDrivingDays } from './rideModel';

export type RequestTransitionCode =
  | 'CREATED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_PENDING'
  | 'LEGACY_RECURRING_REQUEST'
  | 'WRONG_OCCURRENCE'
  | 'DUPLICATE_COMMITMENT'
  | 'SCHEDULE_CONFLICT'
  | 'INVALID_SEAT_QUANTITY'
  | 'NO_REMAINING_CAPACITY'
  | 'OUTDATED_PROPOSAL'
  | 'INVALID_PROPOSAL'
  | 'OFFER_CHANGED';

export interface RequestTransition<T> {
  ok: boolean;
  code: RequestTransitionCode;
  requests: T[];
}

export function createDatedOutgoingRequest(
  proposal: DatedRideProposalV1,
  requestId: string,
): OutgoingRequest {
  const weekday = weekdayForDate(proposal.occurrence.localDate);
  if (!weekday) throw new Error('A dated request requires a valid occurrence date.');
  return {
    id: requestId,
    offerId: proposal.participants.offerId,
    days: [weekday],
    status: 'pending',
    proposal,
  };
}

export function transitionDatedOutgoingRequest(options: {
  requests: readonly OutgoingRequest[];
  requestId: string;
  status: Extract<RequestStatus, 'accepted' | 'declined'>;
  offers: readonly DriverOffer[];
  nowEpochSeconds: number;
  riderCommute?: CommuteSchedule | null;
  incoming?: readonly IncomingRequest[];
  skippedDates?: readonly string[];
}): RequestTransition<OutgoingRequest> {
  const current = options.requests.find((request) => request.id === options.requestId);
  if (!current) return unchanged(options.requests, 'REQUEST_NOT_FOUND');
  if (current.status !== 'pending') return unchanged(options.requests, 'NOT_PENDING');
  if (!current.proposal) return unchanged(options.requests, 'LEGACY_RECURRING_REQUEST');
  if (options.status === 'declined') return changed(options.requests, current.id, 'declined', 'DECLINED');

  const proposalCheck = validateDatedRideProposal(current.proposal, options.nowEpochSeconds);
  if (!proposalCheck.ok) {
    return unchanged(options.requests, proposalCheck.code === 'OUTDATED_PROPOSAL' ? 'OUTDATED_PROPOSAL' : 'INVALID_PROPOSAL');
  }
  const proposal = current.proposal;
  const weekday = weekdayForDate(proposal.occurrence.localDate);
  if (!weekday || current.days.length !== 1 || current.days[0] !== weekday) {
    return unchanged(options.requests, 'WRONG_OCCURRENCE');
  }
  if (options.skippedDates?.includes(proposal.occurrence.localDate)) {
    return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  if (options.riderCommute) {
    const plan = options.riderCommute.days.find((day) => day.day === weekday);
    if (!plan || plan.mode === 'drive' || plan.arriveBy === null) return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  if (options.incoming?.some((request) => request.status === 'accepted' && requestOccursOn(request, proposal.occurrence.localDate, weekday))) {
    return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  const offer = options.offers.find((candidate) => candidate.id === current.offerId);
  if (
    !offer
    || offer.id !== proposal.participants.offerId
    || offer.campusLot !== proposal.agreed.campusDropoff.campusLot
    || !offer.days.includes(weekday)
  ) {
    return unchanged(options.requests, 'OFFER_CHANGED');
  }
  const seats = proposal.agreed.requestedSeats;
  if (!Number.isInteger(seats) || seats < 1) return unchanged(options.requests, 'INVALID_SEAT_QUANTITY');

  const acceptedOnOccurrence = options.requests.filter((request) => (
    request.id !== current.id
    && request.status === 'accepted'
    && requestOccursOn(request, proposal.occurrence.localDate, weekday)
  ));
  if (acceptedOnOccurrence.some((request) => (
    request.offerId === current.offerId
    && request.proposal?.participants.riderId === proposal.participants.riderId
  ))) {
    return unchanged(options.requests, 'DUPLICATE_COMMITMENT');
  }
  if (acceptedOnOccurrence.some((request) => (
    !request.proposal || request.proposal.participants.riderId === proposal.participants.riderId
  ))) {
    return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  const seatsCommitted = acceptedOnOccurrence
    .filter((request) => request.offerId === current.offerId)
    .reduce((total, request) => total + requestSeats(request), 0);
  if (seatsCommitted + seats > offer.seatsLeft) return unchanged(options.requests, 'NO_REMAINING_CAPACITY');
  return changed(options.requests, current.id, 'accepted', 'ACCEPTED');
}

/**
 * State-changing validation for requests received by the current driver.
 * Legacy fixtures remain recurring and receive only their legacy weekday checks;
 * no date, point, or evaluated time is invented for them.
 */
export function transitionIncomingRequest(options: {
  commute: CommuteSchedule | null;
  requests: readonly IncomingRequest[];
  outgoing: readonly OutgoingRequest[];
  requestId: string;
  status: Extract<RequestStatus, 'accepted' | 'declined'>;
  nowEpochSeconds: number;
  driverOccurrences?: readonly DriverOccurrenceOverride[];
}): RequestTransition<IncomingRequest> {
  const current = options.requests.find((request) => request.id === options.requestId);
  if (!current) return unchanged(options.requests, 'REQUEST_NOT_FOUND');
  if (current.status !== 'pending') return unchanged(options.requests, 'NOT_PENDING');
  if (options.status === 'declined') return changed(options.requests, current.id, 'declined', 'DECLINED');
  if (!options.commute) return unchanged(options.requests, 'SCHEDULE_CONFLICT');

  if (!current.proposal) {
    const sharedDays = sharedDrivingDays(options.commute, current);
    if (sharedDays.length === 0) return unchanged(options.requests, 'SCHEDULE_CONFLICT');
    if (sharedDays.some((day) => options.outgoing.some((request) => request.status === 'accepted' && request.days.includes(day)))) {
      return unchanged(options.requests, 'SCHEDULE_CONFLICT');
    }
    const capacity = options.commute.seats ?? 0;
    if (requestSeats(current) < 1) return unchanged(options.requests, 'INVALID_SEAT_QUANTITY');
    if (sharedDays.some((day) => acceptedSeatsOnDay(options.requests, day) + requestSeats(current) > capacity)) {
      return unchanged(options.requests, 'NO_REMAINING_CAPACITY');
    }
    return changed(options.requests, current.id, 'accepted', 'ACCEPTED');
  }

  const proposalCheck = validateDatedRideProposal(current.proposal, options.nowEpochSeconds);
  if (!proposalCheck.ok) {
    return unchanged(options.requests, proposalCheck.code === 'OUTDATED_PROPOSAL' ? 'OUTDATED_PROPOSAL' : 'INVALID_PROPOSAL');
  }
  const proposal = current.proposal;
  const weekday = weekdayForDate(proposal.occurrence.localDate);
  const plan = weekday && options.commute.days.find((day) => day.day === weekday);
  const driverOccurrence = options.driverOccurrences?.find((occurrence) => (
    occurrence.localDate === proposal.occurrence.localDate
    && occurrence.direction === proposal.occurrence.direction
    && occurrence.driverId === proposal.participants.driverId
    && occurrence.campusLot === proposal.agreed.campusDropoff.campusLot
  ));
  if (!weekday || current.days.length !== 1 || current.days[0] !== weekday || proposal.occurrence.direction !== 'TO_CAMPUS') {
    return unchanged(options.requests, 'WRONG_OCCURRENCE');
  }
  if (!driverOccurrence && (!plan || plan.mode === 'ride' || plan.arriveBy === null || options.commute.campusLot !== proposal.agreed.campusDropoff.campusLot)) {
    return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  const acceptedOnOccurrence = options.requests.filter((request) => (
    request.id !== current.id
    && request.status === 'accepted'
    && (driverOccurrence
      ? request.proposal?.occurrence.localDate === proposal.occurrence.localDate
        && request.proposal.occurrence.direction === proposal.occurrence.direction
      : requestOccursOn(request, proposal.occurrence.localDate, weekday))
  ));
  if (acceptedOnOccurrence.some((request) => request.proposal?.participants.riderId === proposal.participants.riderId)) {
    return unchanged(options.requests, 'DUPLICATE_COMMITMENT');
  }
  if (options.outgoing.some((request) => request.status === 'accepted' && requestOccursOn(request, proposal.occurrence.localDate, weekday))) {
    return unchanged(options.requests, 'SCHEDULE_CONFLICT');
  }
  const capacity = driverOccurrence?.passengerCapacity ?? options.commute.seats ?? 0;
  const seatsCommitted = acceptedOnOccurrence.reduce((total, request) => total + requestSeats(request), 0);
  if (seatsCommitted + proposal.agreed.requestedSeats > capacity) return unchanged(options.requests, 'NO_REMAINING_CAPACITY');
  return changed(options.requests, current.id, 'accepted', 'ACCEPTED');
}

function weekdayForDate(localDate: string): Weekday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[date.getUTCDay()];
}

function acceptedSeatsOnDay(requests: readonly IncomingRequest[], day: Weekday): number {
  return requests
    .filter((request) => request.status === 'accepted' && request.days.includes(day))
    .reduce((total, request) => total + requestSeats(request), 0);
}

function unchanged<T>(requests: readonly T[], code: RequestTransitionCode): RequestTransition<T> {
  return { ok: false, code, requests: requests as T[] };
}

function changed<T extends { id: string; status: RequestStatus }>(
  requests: readonly T[],
  id: string,
  status: RequestStatus,
  code: RequestTransitionCode,
): RequestTransition<T> {
  return {
    ok: true,
    code,
    requests: requests.map((request) => request.id === id ? { ...request, status } : request),
  };
}
