import { lotTitle, type CampusLotId, type Coordinates } from '../commute/commuteModel';

export interface CampusDestinationMapLocation {
  id: CampusLotId;
  coordinate: Coordinates;
  title: string;
}

// Public campus destinations keyed by the existing commute destination IDs.
// Keeping these map coordinates here lets other map UI reuse them without
// adding location details to the saved commute model.
const campusDestinationCoordinates: Record<CampusLotId, Coordinates> = {
  westSide: { latitude: 40.9130574, longitude: -73.1304816 },
  eastSide: { latitude: 40.9169623, longitude: -73.1208533 },
  tabler: { latitude: 40.9097068, longitude: -73.1269548 },
  roth: { latitude: 40.9107148, longitude: -73.1237186 },
  lot40: { latitude: 40.8958, longitude: -73.1248 },
  other: { latitude: 40.9124, longitude: -73.1235 },
};

export function getCampusDestinationMapLocation(
  id: CampusLotId,
): CampusDestinationMapLocation {
  return {
    id,
    coordinate: campusDestinationCoordinates[id],
    title: lotTitle(id),
  };
}
