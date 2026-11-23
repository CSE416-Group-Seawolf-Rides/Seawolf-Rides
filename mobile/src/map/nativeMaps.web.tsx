import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Circle as LeafletCircle,
  MapContainer,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
  Popup,
  TileLayer,
  useMapEvents,
} from 'react-leaflet';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';
import {
  anchorTransform,
  coordinateEvent,
  coordinatesCorners,
  dashArray,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  fitPadding,
  MAX_ZOOM,
  pinSvg,
  regionCorners,
  zoomForRegion,
  type EdgePadding,
  type LatLng,
  type Region,
} from './webMapGeometry';

export type { Camera, MapPressEvent } from 'react-native-maps';

// Browser version of react-native-maps, built on Leaflet with OpenStreetMap tiles.
// It accepts the props and ref methods our screens use, so screen code is shared with
// the native app (src/map/nativeMaps.tsx). Phones never load this file.

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type PressHandler = (event: ReturnType<typeof coordinateEvent>) => void;

interface CameraLike {
  center?: LatLng;
  zoom?: number;
}

interface MapViewProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  initialCamera?: CameraLike;
  camera?: CameraLike;
  onPress?: PressHandler;
  onPanDrag?: PressHandler;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
}

interface WebMapHandle {
  animateCamera(camera: CameraLike, options?: { duration?: number }): void;
  animateToRegion(region: Region, duration?: number): void;
  fitToCoordinates(coordinates?: LatLng[], options?: { edgePadding?: EdgePadding; animated?: boolean }): void;
  getCamera(): Promise<{ center: LatLng; zoom: number; heading: number; pitch: number; altitude: number }>;
}

/** Where the map should look before anyone moves it. */
function initialView(props: MapViewProps): (map: L.Map) => void {
  const camera = props.initialCamera ?? props.camera;
  if (camera?.center) {
    const { latitude, longitude } = camera.center;
    const zoom = camera.zoom ?? DEFAULT_ZOOM;
    return (map) => map.setView([latitude, longitude], zoom, { animate: false });
  }
  const region = props.initialRegion ?? props.region;
  if (region) return (map) => map.fitBounds(regionCorners(region), { animate: false });
  return (map) => map.setView([DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], DEFAULT_ZOOM, { animate: false });
}

function startingCenterAndZoom(props: MapViewProps): { center: [number, number]; zoom: number } {
  const camera = props.initialCamera ?? props.camera;
  if (camera?.center) {
    return { center: [camera.center.latitude, camera.center.longitude], zoom: camera.zoom ?? DEFAULT_ZOOM };
  }
  const region = props.initialRegion ?? props.region;
  if (region) return { center: [region.latitude, region.longitude], zoom: zoomForRegion(region) };
  return { center: [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude], zoom: DEFAULT_ZOOM };
}

/** Forwards Leaflet map events to the react-native-maps style handlers. */
function MapEvents({
  latest,
  onUserMove,
}: {
  latest: { current: MapViewProps };
  onUserMove: () => void;
}) {
  const map = useMapEvents({
    click(event) {
      // A click lets the mouse wheel zoom this map (see below).
      if (latest.current.zoomEnabled !== false) map.scrollWheelZoom.enable();
      latest.current.onPress?.(
        coordinateEvent(event.latlng.lat, event.latlng.lng, {
          position: { x: event.containerPoint.x, y: event.containerPoint.y },
        }),
      );
    },
    dragstart() {
      onUserMove();
    },
    drag() {
      const center = map.getCenter();
      latest.current.onPanDrag?.(coordinateEvent(center.lat, center.lng));
    },
    mouseout() {
      // Wheel zoom stays off until the map is clicked, so scrolling the page over an
      // embedded map scrolls the page instead of zooming the map.
      map.scrollWheelZoom.disable();
    },
  });
  return null;
}

/** A ref that always holds the latest props, for event handlers registered once. */
function useLatest<T>(value: T) {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  return latest;
}

const MapView = forwardRef<WebMapHandle, MapViewProps>(function WebMapView(props, ref) {
  const latest = useLatest(props);
  const mapRef = useRef<L.Map | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  // The view to restore when a hidden (0×0) map becomes visible, until the user drags it.
  const viewIntent = useRef<((target: L.Map) => void) | null>(initialView(props));
  const [start] = useState(() => startingCenterAndZoom(props));
  const interactive = props.scrollEnabled !== false;
  const zoomable = props.zoomEnabled !== false;

  useImperativeHandle(
    ref,
    () => ({
      animateCamera(camera, options) {
        const target = mapRef.current;
        const apply = (instance: L.Map) => {
          const center = camera.center ?? { latitude: instance.getCenter().lat, longitude: instance.getCenter().lng };
          const zoom = camera.zoom ?? instance.getZoom();
          instance.setView([center.latitude, center.longitude], zoom, { animate: (options?.duration ?? 500) > 0 });
        };
        viewIntent.current = apply;
        if (target) apply(target);
      },
      animateToRegion(region, duration = 500) {
        const apply = (instance: L.Map) => instance.fitBounds(regionCorners(region), { animate: duration > 0 });
        viewIntent.current = apply;
        if (mapRef.current) apply(mapRef.current);
      },
      fitToCoordinates(coordinates = [], options) {
        const corners = coordinatesCorners(coordinates);
        if (!corners) return;
        const [[south, west], [north, east]] = corners;
        const apply = (instance: L.Map) => {
          if (south === north && west === east) {
            instance.setView([south, west], Math.max(instance.getZoom(), 15), { animate: options?.animated ?? true });
            return;
          }
          instance.fitBounds(corners, { ...fitPadding(options?.edgePadding), animate: options?.animated ?? true });
        };
        viewIntent.current = apply;
        if (mapRef.current) apply(mapRef.current);
      },
      async getCamera() {
        const instance = mapRef.current;
        const center = instance
          ? { latitude: instance.getCenter().lat, longitude: instance.getCenter().lng }
          : { latitude: start.center[0], longitude: start.center[1] };
        return { center, zoom: instance?.getZoom() ?? start.zoom, heading: 0, pitch: 0, altitude: 0 };
      },
    }),
    [start],
  );

  // Once the map exists, show the starting view at its real size.
  useEffect(() => {
    if (!map) return;
    viewIntent.current?.(map);
  }, [map]);

  // A controlled `region` prop moves the map whenever it changes.
  const region = props.region;
  const regionKey = region
    ? `${region.latitude},${region.longitude},${region.latitudeDelta},${region.longitudeDelta}`
    : '';
  useEffect(() => {
    if (!map || !region) return;
    const apply = (instance: L.Map) => instance.fitBounds(regionCorners(region), { animate: false });
    viewIntent.current = apply;
    apply(map);
    // regionKey captures the region's value; the object itself changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, regionKey]);

  // Maps in sheets, modals and background screens start hidden at 0×0. Re-measure on
  // every size change and re-apply the intended view when the map first gets a size.
  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return;
    const container = map.getContainer();
    let hadSize = container.clientWidth > 0 && container.clientHeight > 0;
    const observer = new ResizeObserver(() => {
      const hasSize = container.clientWidth > 0 && container.clientHeight > 0;
      map.invalidateSize({ animate: false });
      if (hasSize && !hadSize) viewIntent.current?.(map);
      hadSize = hasSize;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return (
    <View style={[styles.frame, props.style]}>
      <MapContainer
        attributionControl
        boxZoom={zoomable}
        center={start.center}
        doubleClickZoom={zoomable}
        dragging={interactive}
        keyboard={interactive}
        maxZoom={MAX_ZOOM}
        ref={(instance) => {
          mapRef.current = instance;
          if (instance && instance !== map) setMap(instance);
        }}
        scrollWheelZoom={false}
        style={mapContainerStyle}
        touchZoom={zoomable}
        zoom={start.zoom}
        zoomControl={zoomable}
      >
        <TileLayer attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} url={TILE_URL} />
        <MapEvents latest={latest} onUserMove={() => (viewIntent.current = null)} />
        {props.children}
      </MapContainer>
    </View>
  );
});

export default MapView;

interface MarkerProps extends PropsWithChildren {
  coordinate: LatLng;
  title?: string;
  description?: string;
  pinColor?: string;
  anchor?: { x?: number; y?: number };
  zIndex?: number;
  draggable?: boolean;
  onPress?: PressHandler;
  onDragEnd?: PressHandler;
  accessibilityLabel?: string;
}

export function Marker(props: MarkerProps) {
  const latest = useLatest(props);
  const hasCustomView = props.children !== undefined && props.children !== null && props.children !== false;
  // An empty div that Leaflet places on the map; React renders custom pin views into it.
  const [host] = useState(() => document.createElement('div'));
  const anchorKey = `${props.anchor?.x ?? 0.5},${props.anchor?.y ?? 1}`;

  const icon = useMemo(() => {
    if (hasCustomView) {
      return L.divIcon({ className: 'seawolf-map-marker', html: host, iconSize: [0, 0] });
    }
    const label = (props.accessibilityLabel ?? props.title ?? 'Map pin').replace(/[<>&"]/g, '');
    return L.divIcon({
      className: 'seawolf-map-marker',
      html: `<div aria-label="${label}" style="position:absolute;left:0;top:0;transform:${anchorTransform(props.anchor)}">${pinSvg(props.pinColor)}</div>`,
      iconSize: [0, 0],
    });
    // anchorKey stands in for the anchor object, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCustomView, host, props.pinColor, props.title, props.accessibilityLabel, anchorKey]);

  const eventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click(event) {
        const { lat, lng } = (event as L.LeafletMouseEvent).latlng ?? { lat: 0, lng: 0 };
        latest.current.onPress?.(coordinateEvent(lat, lng, { action: 'marker-press' }));
      },
      dragend(event) {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        latest.current.onDragEnd?.(coordinateEvent(lat, lng));
      },
    }),
    [latest],
  );

  const position: [number, number] = [props.coordinate.latitude, props.coordinate.longitude];
  const customView = hasCustomView
    ? createPortal(
        <div
          aria-label={props.accessibilityLabel ?? props.title}
          style={{ left: 0, position: 'absolute', top: 0, transform: anchorTransform(props.anchor) }}
        >
          {props.children as ReactNode}
        </div>,
        host,
      )
    : null;
  return (
    <>
      <LeafletMarker
        draggable={props.draggable ?? false}
        eventHandlers={eventHandlers}
        icon={icon}
        keyboard
        position={position}
        title={props.title}
        zIndexOffset={(props.zIndex ?? 0) * 10}
      >
        {(props.title || props.description) && (
          <Popup closeButton={false} offset={[0, -36]}>
            {props.title ? <strong>{props.title}</strong> : null}
            {props.title && props.description ? <br /> : null}
            {props.description ?? null}
          </Popup>
        )}
      </LeafletMarker>
      {customView}
    </>
  );
}

interface PolylineProps {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

export function Polyline(props: PolylineProps) {
  const positions = props.coordinates.map((point) => [point.latitude, point.longitude] as [number, number]);
  return (
    <LeafletPolyline
      interactive={false}
      pathOptions={{
        color: props.strokeColor ?? '#000000',
        dashArray: dashArray(props.lineDashPattern),
        lineCap: props.lineCap ?? 'round',
        lineJoin: props.lineJoin ?? 'round',
        opacity: 1,
        weight: props.strokeWidth ?? 1,
      }}
      positions={positions}
    />
  );
}

interface CircleProps {
  center: LatLng;
  radius: number;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

export function Circle(props: CircleProps) {
  return (
    <LeafletCircle
      center={[props.center.latitude, props.center.longitude]}
      interactive={false}
      pathOptions={{
        color: props.strokeColor ?? '#000000',
        fill: Boolean(props.fillColor),
        // The fill colour carries its own alpha (e.g. rgba(153, 0, 0, 0.14)).
        fillColor: props.fillColor,
        fillOpacity: 1,
        opacity: 1,
        weight: props.strokeWidth ?? 1,
      }}
      radius={props.radius}
    />
  );
}

const mapContainerStyle = { position: 'absolute', inset: 0, height: '100%', width: '100%' } as const;

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
});
