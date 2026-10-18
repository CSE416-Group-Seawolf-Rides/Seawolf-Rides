import type { MatchCard } from './service';

export type RideRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
/** Server-owned dated request. ACCEPTED is the persisted ride/reservation record. */
export interface RideRequest {
  id: string;
  schemaVersion: 1;
  source?: 'CALENDAR';
  participantIds: string[];
  driverId: string;
  riderId: string;
  driverName: string;
  riderName: string;
  localDate: string;
  direction: 'TO_CAMPUS';
  status: RideRequestStatus;
  riderRevision: string;
  driverRevision: string;
  seats: number;
  pickupLabel: string;
  campusLabel: string;
  plan: MatchCard['plan'];
  metrics: MatchCard['metrics'];
  createdAt: number;
  updatedAt: number;
}

export interface CreateRideRequestInput {
  source?: 'CALENDAR';
  proposedPlan?: { departure: number; pickup: number; vehicleCampusArrival: number };
  driverId: string;
  localDate: string;
  riderRevision: string;
  driverRevision: string;
  direction: 'TO_CAMPUS';
}
export interface RideRequestResult {
  id: string;
  status: RideRequestStatus;
}
