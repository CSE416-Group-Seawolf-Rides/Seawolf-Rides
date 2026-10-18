import type { CalendarMatch } from '../calendar/calendarMatching';
import type { Coordinates } from '../commute/commuteModel';
import { requestInitiator, type RideRequest } from '../mvp/rideRequestModel';

export interface ChatThread {
  id: string;
  participantIds: string[];
  names: Record<string, string>;
  localDate: string;
  campusLabel: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
  requestId?: string;
  trip?: ChatTrip;
}
export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  sentAt: number;
  sequence: number;
}
export const chatPartner = (thread: ChatThread, uid: string) =>
  thread.participantIds.find((id) => id !== uid) ?? '';

/** Only shared timing/context; never include exact pickup/start points. */
export interface ChatTrip {
  driverId: string;
  riderId: string;
  localDate: string;
  campusLabel: string;
  departure: number;
  pickup: number;
  vehicleCampusArrival: number;
}
export function chatContext(thread: ChatThread, uid: string, request?: RideRequest) {
  if (!request) return { title: 'Match inquiry', status: '', trip: thread.trip };
  const initiator = requestInitiator(request);
  const title = initiator === uid ? 'You sent a request' : `${thread.names[initiator] ?? 'Your carpool partner'} sent you a request`;
  return { title, status: { PENDING: 'Pending', ACCEPTED: 'Accepted', DECLINED: 'Declined', CANCELLED: 'Cancelled' }[request.status],
    trip: { driverId: request.driverId, riderId: request.riderId, localDate: request.localDate,
      campusLabel: request.campusLabel, departure: request.plan.departure, pickup: request.plan.pickup,
      vehicleCampusArrival: request.plan.vehicleCampusArrival } };
}

export interface ChatMatchDetails {
  localDate: string;
  ownPoint: Coordinates;
  match: CalendarMatch;
}
