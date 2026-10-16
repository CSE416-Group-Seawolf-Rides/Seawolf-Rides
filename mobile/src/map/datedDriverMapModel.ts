import { toPrivacyArea } from '../commute/commuteModel';
import type { DriverOccurrenceOverride, IncomingRequest } from '../rides/rideModel';
import type { RiderMapCandidate } from './riderMapModel';

export const PENDING_PICKUP_PRIVACY_LABEL = 'Approximate area — pickup shared after acceptance.';

export interface DatedRiderMapOwnership {
  driverOccurrenceId: string;
  driverParticipantId: string;
  localDate: string;
  direction: 'TO_CAMPUS';
  timeZone: string;
}

export interface DatedPendingRiderMapCandidate extends RiderMapCandidate {
  participantId: string;
  ownership: DatedRiderMapOwnership;
  privacyLabel: typeof PENDING_PICKUP_PRIVACY_LABEL;
}

export interface DatedDriverMapPresentation {
  pendingRiders: DatedPendingRiderMapCandidate[];
  acceptedRequestIds: string[];
}

export function selectDatedDriverMapOccurrence(options: {
  occurrences: readonly DriverOccurrenceOverride[];
  selection: { tripId?: string; date?: string; direction?: string };
  selectedDriverId?: string;
  fallbackOccurrenceId?: string;
}): DriverOccurrenceOverride | null {
  const hasExplicitSelection = Boolean(options.selection.tripId || options.selection.date || options.selection.direction);
  if (hasExplicitSelection) {
    if (!options.selection.date || options.selection.direction !== 'TO_CAMPUS') return null;
    const candidates = options.occurrences.filter((occurrence) => (
      occurrence.localDate === options.selection.date
      && occurrence.direction === options.selection.direction
    ));
    if (options.selectedDriverId) {
      return candidates.find((occurrence) => occurrence.driverId === options.selectedDriverId) ?? null;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }
  return options.fallbackOccurrenceId
    ? options.occurrences.find((occurrence) => occurrence.id === options.fallbackOccurrenceId) ?? null
    : null;
}

/**
 * Builds display-only privacy areas for one exact driver occurrence. Exact pending
 * pickups are used only as input to the established privacy transform and are not
 * returned from this boundary.
 */
export function buildDatedDriverMapPresentation(options: {
  occurrence: DriverOccurrenceOverride | null;
  requests: readonly IncomingRequest[];
}): DatedDriverMapPresentation {
  const { occurrence } = options;
  if (!occurrence) return { pendingRiders: [], acceptedRequestIds: [] };

  const owned = options.requests.filter((request) => {
    const proposal = request.proposal;
    return proposal
      && proposal.participants.driverId === occurrence.driverId
      && proposal.occurrence.localDate === occurrence.localDate
      && proposal.occurrence.direction === occurrence.direction
      && proposal.occurrence.timeZone === occurrence.timeZone;
  });
  const ownership: DatedRiderMapOwnership = {
    driverOccurrenceId: occurrence.id,
    driverParticipantId: occurrence.driverId,
    localDate: occurrence.localDate,
    direction: occurrence.direction,
    timeZone: occurrence.timeZone,
  };

  return {
    pendingRiders: owned.flatMap((request) => request.status === 'pending' && request.proposal
      ? [{
          id: request.id,
          participantId: request.participantId ?? request.proposal.participants.riderId,
          name: request.riderName,
          approximateArea: toPrivacyArea(request.proposal.agreed.pickup.coordinate, request.startAreaLabel),
          ownership: { ...ownership },
          privacyLabel: PENDING_PICKUP_PRIVACY_LABEL,
        }]
      : []),
    acceptedRequestIds: owned
      .filter((request) => request.status === 'accepted')
      .map((request) => request.id),
  };
}
