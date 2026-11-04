// DEV-ONLY raster basemap for the car surface.
//
// react-native-maps (the phone's map) does not render inside the Android Auto / AAOS
// virtual-display surface, so in dev builds we paint OpenStreetMap raster tiles under the
// SVG route instead. The tiles are positioned with the exact same local projection that
// CarMapSurface uses for the route, so the line stays registered with the map.
//
// OSM's tile usage policy is for light use only: this is gated behind __DEV__ and must be
// replaced with a licensed tile provider before any production car build.
import { Image, StyleSheet, Text, View } from 'react-native';


const METERS_PER_DEGREE = 111_320;
const TILE_URL = 'https://tile.openstreetmap.org';
const USER_AGENT = 'SeawolfRides-dev/0.1 (car map dev preview)';
const MIN_ZOOM = 13;
const MAX_ZOOM = 18;
const MAX_TILES = 36;

export interface TileView {
  x0: number; // center longitude
  y0: number; // center latitude
  metersPerPixel: number;
  lonScale: number;
}

export const DEV_TILES_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_CAR_DEV_TILES !== '0';

const lonToTileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const latToTileY = (lat: number, z: number) => {
  const rad = lat * Math.PI / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
};
const tileXToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileYToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

export function DevTileLayer({ view, width, height }: { view: TileView; width: number; height: number }) {
  // Pick the zoom whose ground resolution is closest to the view's, so tiles are ~256px.
  const resolution0 = 156_543.03 * Math.cos(view.y0 * Math.PI / 180);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(Math.log2(resolution0 / view.metersPerPixel))));

  // Geographic bounds of the visible area (inverse of the SVG projection).
  const lonPerPixel = view.metersPerPixel / (METERS_PER_DEGREE * view.lonScale);
  const latPerPixel = view.metersPerPixel / METERS_PER_DEGREE;
  const west = view.x0 - (width / 2) * lonPerPixel;
  const east = view.x0 + (width / 2) * lonPerPixel;
  const north = view.y0 + (height / 2) * latPerPixel;
  const south = view.y0 - (height / 2) * latPerPixel;

  const minX = Math.floor(lonToTileX(west, zoom));
  const maxX = Math.floor(lonToTileX(east, zoom));
  const minY = Math.floor(latToTileY(north, zoom));
  const maxY = Math.floor(latToTileY(south, zoom));
  if ((maxX - minX + 1) * (maxY - minY + 1) > MAX_TILES) return null;

  const px = (lon: number) => width / 2 + ((lon - view.x0) * view.lonScale * METERS_PER_DEGREE) / view.metersPerPixel;
  const py = (lat: number) => height / 2 - ((lat - view.y0) * METERS_PER_DEGREE) / view.metersPerPixel;

  const tiles: React.ReactElement[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const left = px(tileXToLon(x, zoom));
      const top = py(tileYToLat(y, zoom));
      const right = px(tileXToLon(x + 1, zoom));
      const bottom = py(tileYToLat(y + 1, zoom));
      tiles.push(
        <Image
          key={`${zoom}/${x}/${y}`}
          source={{ uri: `${TILE_URL}/${zoom}/${x}/${y}.png`, headers: { 'User-Agent': USER_AGENT } }}
          style={{ position: 'absolute', left, top, width: right - left + 0.5, height: bottom - top + 0.5 }}
        />,
      );
    }
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tiles}
      <Text style={styles.attribution}>© OpenStreetMap contributors (dev preview)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  attribution: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    bottom: 90,
    color: '#333',
    fontSize: 11,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 6,
  },
});
