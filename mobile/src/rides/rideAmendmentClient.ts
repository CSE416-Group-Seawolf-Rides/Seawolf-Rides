import { collection, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import type {
  RideAmendmentDecision,
  RideAmendmentType,
} from '../mvp/rideAmendmentModel';

const call = <T, R = unknown>(name: string) => httpsCallable<T, R>(getFirebaseFunctions(), name);

export const newAmendmentProposalId = () =>
  doc(collection(getFirebaseFirestore(), 'rideRequests')).id;

export interface ProposeAmendmentInput {
  type: RideAmendmentType;
  proposedDeparture?: number;
  proposedPickupLabel?: string;
  note?: string;
}

export async function proposeRideAmendment(
  requestId: string,
  proposalId: string,
  input: ProposeAmendmentInput,
) {
  await call('proposeRideAmendment')({
    requestId,
    proposalId,
    type: input.type,
    proposedDeparture: input.proposedDeparture,
    proposedPickupLabel: input.proposedPickupLabel,
    note: input.note,
  });
}

export async function respondToRideAmendment(
  requestId: string,
  proposalId: string,
  decision: RideAmendmentDecision,
) {
  await call('respondToRideAmendment')({
    requestId,
    proposalId,
    decision,
  });
}

