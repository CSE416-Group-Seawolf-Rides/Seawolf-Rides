import type { DriverOffer, RiderRequest } from '../rides/rideModel';
import { MAX_PROFILE_BIO_LENGTH, MAX_PROFILE_PHOTO_LENGTH } from '../persistence/userDataModel';

export type PublicProfileRole = 'rider' | 'driver' | 'both';
export type SampleAvatar = 'coral' | 'ocean' | 'forest' | 'violet' | 'gold' | 'sky';

export interface PublicProfile {
  participantId: string;
  displayName: string;
  role?: PublicProfileRole;
  synthetic: boolean;
  /** Optional, explicitly public facts only. Never place routing or schedule data here. */
  publicInfo: string[];
  photoUri?: string;
  sampleAvatar?: SampleAvatar;
}

const profiles: readonly PublicProfile[] = [
  profile('demo-driver-alex', 'Alex', 'driver', 'ocean'),
  profile('demo-driver-sarah', 'Sarah', 'driver', 'violet'),
  profile('demo-driver-priya', 'Priya', 'driver', 'coral'),
  profile('demo-driver-marcus', 'Marcus', 'driver', 'forest'),
  profile('demo-driver-jenna', 'Jenna', 'driver', 'gold'),
  profile('demo-driver-dan', 'Dan', 'driver', 'sky'),
  profile('demo-driver-omar', 'Omar', 'driver', 'ocean'),
  profile('demo-driver-lena', 'Lena', 'driver', 'forest'),
  profile('demo-driver-jordan', 'Jordan', 'driver', 'violet'),
  profile('demo-driver-hannah', 'Hannah', 'driver', 'coral'),
  profile('demo-driver-queens-test', 'Queens test driver', 'driver', 'sky'),
  profile('demo-rider-dev', 'Dev', 'rider', 'sky'),
  profile('demo-rider-maya', 'Maya', 'rider', 'violet'),
  profile('demo-rider-chris', 'Chris', 'rider', 'forest'),
  profile('demo-rider-sam', 'Sam', 'rider', 'gold'),
  profile('demo-rider-nia', 'Nia', 'rider', 'coral'),
  profile('friday-driver-test-ava', 'Ava', 'rider', 'coral'),
  profile('friday-driver-test-ben', 'Ben', 'rider', 'ocean'),
  profile('friday-driver-test-chloe', 'Chloe', 'rider', 'forest'),
  profile('demo3x7-person-jordan', 'Jordan — Queens', 'driver', 'ocean'),
  profile('demo3x7-person-morgan', 'Morgan', 'driver', 'violet'),
  profile('demo3x7-person-taylor', 'Taylor', 'driver', 'forest'),
  profile('demo3x7-person-ava', 'Ava', 'rider', 'coral'),
  profile('demo3x7-person-ben', 'Ben', 'rider', 'gold'),
  profile('demo3x7-person-chloe', 'Chloe', 'rider', 'sky'),
  profile('demo3x7-person-diego', 'Diego', 'rider', 'ocean'),
  profile('demo3x7-person-emi', 'Emi', 'rider', 'violet'),
  profile('demo3x7-person-finn', 'Finn', 'rider', 'forest'),
  profile('demo3x7-person-grace', 'Grace', 'rider', 'coral'),
  profile('rider-alex', 'Alex', 'rider', 'gold'),
  profile('rider-blair', 'Blair', 'rider', 'sky'),
  profile('rider-casey', 'Casey', 'rider', 'violet'),
  profile('rider-drew', 'Drew', 'rider', 'forest'),
  profile('rider-erin', 'Erin', 'rider', 'coral'),
  profile('rider-finn', 'Finn', 'rider', 'ocean'),
  profile('queens-rider-maya', 'Maya', 'rider', 'gold'),
  profile('queens-rider-eli', 'Eli', 'rider', 'sky'),
  profile('queens-rider-nina', 'Nina', 'rider', 'violet'),
  profile('queens-rider-rowan', 'Rowan', 'rider', 'forest'),
  profile('queens-rider-sam', 'Sam', 'rider', 'coral'),
];

const profileById = new Map(profiles.map((item) => [item.participantId, item]));

// Explicit compatibility for fixtures created before participant IDs were modeled.
export const legacyOfferParticipantIds: Readonly<Record<string, string>> = {
  alex: 'demo-driver-alex', sarah: 'demo-driver-sarah', priya: 'demo-driver-priya',
  marcus: 'demo-driver-marcus', jenna: 'demo-driver-jenna', dan: 'demo-driver-dan',
  omar: 'demo-driver-omar', lena: 'demo-driver-lena', jordan: 'demo-driver-jordan',
  hannah: 'demo-driver-hannah',
};

export const legacyRequestParticipantIds: Readonly<Record<string, string>> = {
  dev: 'demo-rider-dev', maya: 'demo-rider-maya', chris: 'demo-rider-chris',
  sam: 'demo-rider-sam', nia: 'demo-rider-nia',
};

export function participantIdForOffer(offer: Pick<DriverOffer, 'id' | 'participantId'>): string {
  return offer.participantId ?? legacyOfferParticipantIds[offer.id] ?? `legacy-offer-participant:${offer.id}`;
}

export function participantIdForRequest(request: Pick<RiderRequest, 'id' | 'participantId' | 'proposal'>): string {
  return request.proposal?.participants.riderId
    ?? request.participantId
    ?? legacyRequestParticipantIds[request.id]
    ?? `legacy-request-participant:${request.id}`;
}

export function resolvePublicProfile(
  participantId: string,
  fallbackName = 'Rider',
  directory: readonly PublicProfile[] = profiles,
): PublicProfile {
  const found = directory === profiles
    ? profileById.get(participantId)
    : directory.find((item) => item.participantId === participantId);
  return found ?? {
    participantId,
    displayName: fallbackName.trim() || 'Rider',
    synthetic: false,
    publicInfo: [],
  };
}

export function isKnownPublicProfile(participantId: string): boolean {
  return profileById.has(participantId);
}

export function parsePublicProfile(value: unknown, participantId: string): PublicProfile {
  if (!value || typeof value !== 'object') throw new Error('The public profile is malformed.');
  const data = value as Record<string, unknown>;
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const bio = typeof data.bio === 'string' ? data.bio.trim() : '';
  const photoBase64 = typeof data.photoBase64 === 'string' ? data.photoBase64 : '';
  const role = data.role;
  if (
    data.schemaVersion !== 1 ||
    data.ownerId !== participantId ||
    !displayName ||
    displayName.length > 80 ||
    (role !== 'driver' && role !== 'rider' && role !== 'both') ||
    bio.length > MAX_PROFILE_BIO_LENGTH ||
    photoBase64.length > MAX_PROFILE_PHOTO_LENGTH ||
    (photoBase64 !== '' &&
      (photoBase64.length % 4 !== 0 || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(photoBase64)))
  ) throw new Error('The public profile contains invalid values.');
  return {
    participantId,
    displayName,
    role: role as PublicProfileRole,
    synthetic: false,
    publicInfo: bio ? [bio] : [],
    ...(photoBase64 ? { photoUri: `data:image/jpeg;base64,${photoBase64}` } : {}),
  };
}

function profile(
  participantId: string,
  displayName: string,
  role: PublicProfileRole,
  sampleAvatar: SampleAvatar,
): PublicProfile {
  return {
    participantId,
    displayName,
    role,
    synthetic: true,
    publicInfo: [],
    sampleAvatar,
  };
}
