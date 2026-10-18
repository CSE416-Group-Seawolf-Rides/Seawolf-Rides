import type { Coordinates, PrivacyArea } from '../commute/commuteModel';
import { compareCalendarMatches, type CalendarMatch } from './calendarMatching';

export const MATCH_PAGE_SIZES = [1, 2, 5, 10] as const;
export type MatchPageSize = (typeof MATCH_PAGE_SIZES)[number];
export interface MatchedPerson {
  id: string;
  name: string;
  area: PrivacyArea;
  options: CalendarMatch[];
}
/** Either/Either arrangements remain selectable, but a person gets only one card. */
export function matchedPeople(matches: CalendarMatch[], uid: string): MatchedPerson[] {
  const people = new Map<string, MatchedPerson>();
  for (const match of [...matches].sort(compareCalendarMatches)) {
    const id = match.driverId === uid ? match.riderId : match.driverId;
    const person = people.get(id) ?? {
      id,
      name: match.name,
      area: match.area,
      options: [],
    };
    if (
      !person.options.some(
        (option) =>
          option.driverId === match.driverId && option.riderId === match.riderId,
      )
    )
      person.options.push(match);
    people.set(id, person);
  }
  return [...people.values()];
}
export function matchPage(
  people: MatchedPerson[],
  size: MatchPageSize,
  requested: number,
) {
  if (!MATCH_PAGE_SIZES.includes(size) || !Number.isSafeInteger(requested))
    throw new Error('Invalid match page.');
  const pages = Math.max(1, Math.ceil(people.length / size));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return { page, pages, people: people.slice(page * size, (page + 1) * size) };
}
/** Bounds include the entire approximate circle; its center is never a partner pin. */
export function matchMapRegion(own: Coordinates, area: PrivacyArea) {
  const latRadius = area.radiusMiles / 69;
  const lngRadius =
    latRadius / Math.max(0.01, Math.cos((area.center.latitude * Math.PI) / 180));
  const minLat = Math.min(own.latitude, area.center.latitude - latRadius);
  const maxLat = Math.max(own.latitude, area.center.latitude + latRadius);
  const minLng = Math.min(own.longitude, area.center.longitude - lngRadius);
  const maxLng = Math.max(own.longitude, area.center.longitude + lngRadius);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.3),
    longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.3),
  };
}
