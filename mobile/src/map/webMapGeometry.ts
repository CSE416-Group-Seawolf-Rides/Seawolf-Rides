// Pure helpers that translate react-native-maps props into Leaflet terms for the web map
// (nativeMaps.web.tsx). No Leaflet import here, so these run in Node unit tests.

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface EdgePadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** [south-west, north-east] corners as Leaflet [lat, lng] pairs. */
export type Corners = [[number, number], [number, number]];

export const DEFAULT_CENTER: LatLng = { latitude: 40.9126, longitude: -73.1234 };
export const DEFAULT_ZOOM = 12;
export const MAX_ZOOM = 19;

/** The rectangle a react-native-maps region describes. */
export function regionCorners(region: Region): Corners {
  const halfLat = Math.abs(region.latitudeDelta) / 2;
  const halfLng = Math.abs(region.longitudeDelta) / 2;
  return [
    [region.latitude - halfLat, region.longitude - halfLng],
    [region.latitude + halfLat, region.longitude + halfLng],
  ];
}

/** Smallest rectangle containing every coordinate, or null for an empty list. */
export function coordinatesCorners(coordinates: readonly LatLng[]): Corners | null {
  const valid = coordinates.filter(
    (point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude),
  );
  if (valid.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const { latitude, longitude } of valid) {
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
  }
  return [
    [south, west],
    [north, east],
  ];
}

/**
 * Approximate web-mercator zoom that shows `longitudeDelta` degrees across `widthPx`
 * pixels (256-pixel tiles). Used only before the map knows its real size.
 */
export function zoomForRegion(region: Region, widthPx = 400): number {
  const delta = Math.abs(region.longitudeDelta);
  if (!Number.isFinite(delta) || delta <= 0 || widthPx <= 0) return DEFAULT_ZOOM;
  const zoom = Math.log2((360 * widthPx) / (256 * delta));
  return Math.max(0, Math.min(MAX_ZOOM, Math.round(zoom)));
}

/** react-native-maps edgePadding → Leaflet fitBounds padding. */
export function fitPadding(edgePadding: EdgePadding | undefined) {
  const top = edgePadding?.top ?? 0;
  const right = edgePadding?.right ?? 0;
  const bottom = edgePadding?.bottom ?? 0;
  const left = edgePadding?.left ?? 0;
  return {
    paddingTopLeft: [left, top] as [number, number],
    paddingBottomRight: [right, bottom] as [number, number],
  };
}

/** lineDashPattern [10, 8] → SVG dash array "10 8"; undefined for a solid line. */
export function dashArray(pattern: readonly number[] | undefined): string | undefined {
  const values = (pattern ?? []).filter((value) => Number.isFinite(value) && value >= 0);
  return values.length > 0 ? values.join(' ') : undefined;
}

/**
 * CSS transform that puts the marker's anchor point (0..1 of its own size; default
 * bottom-centre, as in react-native-maps) on the coordinate.
 */
export function anchorTransform(anchor: { x?: number; y?: number } | undefined): string {
  const x = anchor?.x ?? 0.5;
  const y = anchor?.y ?? 1;
  return `translate(${-x * 100}%, ${-y * 100}%)`;
}

/** The event shape react-native-maps passes to onPress / onDragEnd handlers. */
export function coordinateEvent(latitude: number, longitude: number, extra: Record<string, unknown> = {}) {
  return {
    nativeEvent: { coordinate: { latitude, longitude }, ...extra },
    stopPropagation: () => undefined,
    persist: () => undefined,
  };
}

/** Default pin colour of react-native-maps markers. */
export const DEFAULT_PIN_COLOR = '#d93025';

/** A teardrop map pin as an SVG string, 28×40, tip at bottom-centre. */
export function pinSvg(color: string | undefined): string {
  const fill = safeColor(color) ?? DEFAULT_PIN_COLOR;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40" aria-hidden="true">' +
    `<path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>` +
    '<circle cx="14" cy="14" r="5" fill="#ffffff"/></svg>'
  );
}

/** Only plain CSS colour tokens may go into the SVG string (no quotes or markup). */
export function safeColor(color: string | undefined): string | undefined {
  if (typeof color !== 'string') return undefined;
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|rgba|hsl|hsla)\([0-9.,%\s]+\))$/.test(color.trim())
    ? color.trim()
    : undefined;
}
