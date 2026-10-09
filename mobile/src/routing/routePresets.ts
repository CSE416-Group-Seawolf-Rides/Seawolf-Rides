import type { RouteCoordinate } from './types';

export interface RoutePreset {
  id: string;
  label: string;
  coordinate: RouteCoordinate;
}

export const routePresets: readonly RoutePreset[] = [
  {
    id: 'stony-brook-lirr',
    label: 'Stony Brook LIRR',
    coordinate: { latitude: 40.92047, longitude: -73.12844 },
  },
  {
    id: 'west-campus',
    label: 'West Campus',
    coordinate: { latitude: 40.9130574, longitude: -73.1304816 },
  },
  {
    id: 'lot-40',
    label: 'Lot 40',
    coordinate: { latitude: 40.8958, longitude: -73.1248 },
  },
  {
    id: 'smith-haven-mall',
    label: 'Smith Haven Mall',
    coordinate: { latitude: 40.86318, longitude: -73.13077 },
  },
] as const;
