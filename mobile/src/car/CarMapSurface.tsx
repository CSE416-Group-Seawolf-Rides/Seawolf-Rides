// React component rendered by Android Auto onto the navigation map surface.
// It is drawn with react-native-svg (no map-tile provider or API key needed):
// a route line plus the live position, north-up. In PREVIEW it fits the whole
// route; while navigating it follows the car.
import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { carNavigation } from './carNavigationController';
import type { RouteCoordinate } from '../routing/types';

const BACKGROUND = '#10151c';
const ROUTE = '#4da3ff';
const DONE = '#3a4656';
const CAR = '#ffffff';
const FOLLOW_RADIUS_METERS = 350;
const METERS_PER_DEGREE = 111_320;

interface View2D { x0: number; y0: number; metersPerPixel: number; lat0: number; lonScale: number }

function project(view: View2D, point: RouteCoordinate): [number, number] {
  const x = (point.longitude - view.x0) * view.lonScale * METERS_PER_DEGREE / view.metersPerPixel;
  const y = -(point.latitude - view.y0) * METERS_PER_DEGREE / view.metersPerPixel;
  return [x, y];
}

function fitView(points: RouteCoordinate[], width: number, height: number): View2D | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude); maxLon = Math.max(maxLon, p.longitude);
  }
  const lat0 = (minLat + maxLat) / 2;
  const lonScale = Math.cos(lat0 * Math.PI / 180);
  const spanX = Math.max(1, (maxLon - minLon) * lonScale * METERS_PER_DEGREE);
  const spanY = Math.max(1, (maxLat - minLat) * METERS_PER_DEGREE);
  const metersPerPixel = Math.max(spanX / (width * 0.8), spanY / (height * 0.8));
  return { x0: (minLon + maxLon) / 2, y0: lat0, metersPerPixel, lat0, lonScale };
}

function followView(center: RouteCoordinate, width: number, height: number): View2D | null {
  if (width <= 0 || height <= 0) return null;
  return {
    x0: center.longitude,
    y0: center.latitude,
    lat0: center.latitude,
    lonScale: Math.cos(center.latitude * Math.PI / 180),
    metersPerPixel: FOLLOW_RADIUS_METERS * 2 / Math.min(width, height),
  };
}

function toPoints(view: View2D, width: number, height: number, coords: RouteCoordinate[]): string {
  return coords.map((c) => {
    const [x, y] = project(view, c);
    return `${(width / 2 + x).toFixed(1)},${(height / 2 + y).toFixed(1)}`;
  }).join(' ');
}

export function CarMapSurface() {
  const snapshot = useSyncExternalStore(carNavigation.subscribe, carNavigation.getSnapshot);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const route = snapshot.route?.geometry ?? [];
  const navigating = snapshot.status === 'ACTIVE' || snapshot.status === 'REROUTING';
  const position = snapshot.progress?.projectedCoordinate ?? snapshot.fix?.coordinate ?? null;
  const view = navigating && position
    ? followView(position, size.width, size.height)
    : fitView(snapshot.fix ? [...route, snapshot.fix.coordinate] : route, size.width, size.height);

  // Split the line into the part already driven and the part ahead.
  const split = snapshot.progress && snapshot.prepared
    ? Math.min(route.length, snapshot.progress.segmentIndex + 1)
    : 0;

  return (
    <View onLayout={onLayout} style={styles.fill}>
      {view && size.width > 0 ? (
        <Svg height={size.height} width={size.width}>
          {split > 1 && <Polyline fill="none" points={toPoints(view, size.width, size.height, route.slice(0, split))} stroke={DONE} strokeLinecap="round" strokeLinejoin="round" strokeWidth={8} />}
          {route.length > 1 && <Polyline fill="none" points={toPoints(view, size.width, size.height, route.slice(Math.max(0, split - 1)))} stroke={ROUTE} strokeLinecap="round" strokeLinejoin="round" strokeWidth={8} />}
          {position && (() => {
            const [x, y] = project(view, position);
            return <Circle cx={size.width / 2 + x} cy={size.height / 2 + y} fill={CAR} r={9} stroke={ROUTE} strokeWidth={4} />;
          })()}
        </Svg>
      ) : (
        <View style={styles.empty}><Text style={styles.emptyText}>Seawolf Rides</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { backgroundColor: BACKGROUND, flex: 1 },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyText: { color: '#6c7b8d', fontSize: 22, fontWeight: '700' },
});
