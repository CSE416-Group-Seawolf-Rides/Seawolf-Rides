import { type CommuteSchedule, toPrivacyArea } from '../commute/commuteModel';
import type { IncomingRequest, OutgoingRequest, RiderRequest } from '../rides/rideModel';

// Frontend-only M2 fixtures retained for model tests. Real signed-in accounts do not
// receive this profile, commute, history, or ride state.

// "wolfie.seawolf@stonybrook.edu" → "Wolfie"; "jdoe42@…" → "Jdoe".
export function firstNameFromEmail(email: string): string {
  const token = email.split('@')[0].split(/[._\-+\d]/).find(Boolean) ?? '';
  return token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : 'there';
}

// Rides on Mon/Wed/Fri, drives Tue/Thu. The start is stored as a 2-mile privacy
// area, never the exact point it came from.
export const demoCommute: CommuteSchedule = {
  startArea: toPrivacyArea({ latitude: 40.8646, longitude: -73.0818 }, 'Centereach area'),
  campusLot: 'tabler',
  days: [
    { day: 'mon', mode: 'ride', arriveBy: 9 * 60, leaveAt: 17 * 60 },
    { day: 'tue', mode: 'drive', arriveBy: 9 * 60 + 30, leaveAt: 16 * 60 + 30 },
    { day: 'wed', mode: 'ride', arriveBy: 9 * 60, leaveAt: 17 * 60 },
    { day: 'thu', mode: 'drive', arriveBy: 9 * 60 + 30, leaveAt: 16 * 60 + 30 },
    { day: 'fri', mode: 'ride', arriveBy: 10 * 60, leaveAt: 14 * 60 },
  ],
  seats: 3,
};

// A week already in motion: Alex drives Mon/Wed, Friday still needs a driver, Maya
// rides along on Tue/Thu, and a few riders are waiting on an answer.
export const demoOutgoing: OutgoingRequest[] = [
  { id: 'request-alex', offerId: 'alex', days: ['mon', 'wed'], status: 'accepted' },
];

export function demoIncoming(requests: RiderRequest[]): IncomingRequest[] {
  const accepted = new Set(['maya']);
  return requests.map((request) => ({
    ...request,
    status: accepted.has(request.id) ? 'accepted' : 'pending',
  }));
}
