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
  profile('demo-alex', 'Alex', 'driver', 'ocean', 'Mechanical Engineering grad student. Driving from Lake Grove with great playlists and smooth highway routes.'),
  profile('demo-sam', 'Sam', 'driver', 'gold', 'Sophomore majoring in Economics. Driving an all-electric Tesla Model 3 from Hauppauge. Quiet and comfortable ride.'),
  profile('demo-maya', 'Maya', 'rider', 'violet', 'Biochemistry major · Class of 27. Riding from Lake Ronkonkoma on Tuesdays and Thursdays for morning lab.'),
  profile('demo-chris', 'Chris', 'rider', 'forest', 'Senior studying Applied Math & Statistics. Commutes from Stony Brook Station. Early bird for 8:30 AM classes.'),
  profile('demo-jordan', 'Jordan', 'rider', 'ocean', 'Junior in Biology (Pre-Med). Commuting from Selden for morning labs. Coffee lover and podcast listener!'),
  profile('demo-driver-alex', 'Alex', 'driver', 'ocean', 'Mechanical Engineering grad student. Driving from Lake Grove with great playlists and smooth highway routes.'),
  profile('demo-driver-sarah', 'Sarah', 'driver', 'violet', 'Senior in Computer Science. Commuting from Centereach. Reliable driver with SAC parking.'),
  profile('demo-driver-priya', 'Priya', 'driver', 'coral', 'Business major · Commuting from Lake Ronkonkoma. Punctual and friendly.'),
  profile('demo-driver-marcus', 'Marcus', 'driver', 'forest', 'Civil Engineering student. Commuting daily from Patchogue.'),
  profile('demo-driver-jenna', 'Jenna', 'driver', 'gold', 'Psychology junior. Driving from Smithtown. Quiet rides with morning NPR.'),
  profile('demo-driver-dan', 'Dan', 'driver', 'sky', 'Biomedical Engineering senior. Always arrives 15 mins before 9 AM classes.'),
  profile('demo-driver-omar', 'Omar', 'driver', 'ocean', 'Information Systems junior. Driving from Farmingville with easy highway access.'),
  profile('demo-driver-lena', 'Lena', 'driver', 'forest', 'Health Science senior. Daily commuter from Holbrook.'),
  profile('demo-driver-jordan', 'Jordan', 'driver', 'violet', 'Junior in Biology (Pre-Med). Commuting from Selden for morning labs. Coffee lover and podcast listener!'),
  profile('demo-driver-hannah', 'Hannah', 'driver', 'coral', 'English major · Class of 26. Commuting from Stony Brook Station.'),
  profile('demo-driver-queens-test', 'Queens test driver', 'driver', 'sky'),
  profile('demo-rider-dev', 'Dev', 'rider', 'sky', 'Computer Science sophomore. Early commuter to New Computer Science building.'),
  profile('demo-rider-maya', 'Maya', 'rider', 'violet', 'Biochemistry major · Class of 27. Riding from Lake Ronkonkoma on Tuesdays and Thursdays for morning lab.'),
  profile('demo-rider-chris', 'Chris', 'rider', 'forest', 'Senior studying Applied Math & Statistics. Commutes from Stony Brook Station. Early bird for 8:30 AM classes.'),
  profile('demo-rider-sam', 'Sam', 'rider', 'gold', 'Sophomore majoring in Economics. Quiet and reliable commuter.'),
  profile('demo-rider-nia', 'Nia', 'rider', 'coral', 'Art History senior. Morning rides to Staller Center.'),
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
  bio?: string,
): PublicProfile {
  return {
    participantId,
    displayName,
    role,
    synthetic: true,
    publicInfo: bio
      ? [bio]
      : [`${role === 'driver' ? 'Driver' : role === 'rider' ? 'Rider' : 'Commuter'} · Stony Brook University. Verified Seawolf carpooler.`],
    sampleAvatar,
  };
}
