// Android Auto / AAOS screen flow: destination list -> route preview -> active navigation.
// Templates only read from the carNavigation controller and the static campus
// destination list; nothing here touches the phone UI.
import {
  CarPlay,
  ListTemplate,
  MessageTemplate,
  NavigationTemplate,
  RoutePreviewNavigationTemplate,
  type NavigationInfo,
  type NavigationTemplateConfig,
  type AndroidTravelEstimates,
  type DistanceUnits,
} from '@g4rb4g3/react-native-carplay';

import { CarMapSurface } from './CarMapSurface';
import { carNavigation, type CarDestination, type CarNavSnapshot } from './carNavigationController';
import { instructionText, stepRoad, toCarManeuver } from './maneuvers';
import { campusLots, type CampusLotId } from '../commute/commuteModel';
import { getCampusDestinationMapLocation } from '../map/campusDestinations';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

function carDistance(meters: number): { distance: number; distanceUnits: DistanceUnits } {
  const feet = meters * FEET_PER_METER;
  // Switch to miles once the distance exceeds ~0.2 mi, like most nav apps.
  if (feet < 1000) return { distance: Math.max(0, Math.round(feet / 10) * 10), distanceUnits: 'feet' };
  return { distance: Math.round(meters / METERS_PER_MILE * 10) / 10, distanceUnits: 'miles' };
}

function timeZoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function travelEstimate(snapshot: CarNavSnapshot): AndroidTravelEstimates | undefined {
  if (snapshot.remainingDistanceMeters === null || snapshot.remainingDurationSeconds === null) return undefined;
  return {
    distanceRemaining: Math.round(snapshot.remainingDistanceMeters / METERS_PER_MILE * 10) / 10,
    distanceUnits: 'miles',
    timeRemaining: Math.round(snapshot.remainingDurationSeconds),
    destinationTime: {
      timeSinceEpochMillis: Date.now() + snapshot.remainingDurationSeconds * 1000,
      id: timeZoneId(),
    },
  };
}

function campusDestinations(): CarDestination[] {
  return campusLots
    .filter((lot) => lot.value !== 'other')
    .map((lot) => {
      const location = getCampusDestinationMapLocation(lot.value as CampusLotId);
      return { id: lot.value, label: location.title, coordinate: location.coordinate };
    });
}

let current: { destinations?: ListTemplate; navigation?: NavigationTemplate; unsubscribe?: () => void } = {};

function stopNavigationUpdates(): void {
  current.unsubscribe?.();
  current.unsubscribe = undefined;
}

/** Root screen: pick where to go. */
function showDestinations(): void {
  stopNavigationUpdates();
  const destinations = campusDestinations();
  const template = new ListTemplate({
    title: 'Where to?',
    sections: [{
      header: 'Stony Brook campus',
      items: destinations.map((destination) => ({
        id: destination.id,
        text: destination.label,
        detailText: 'Drive to this lot',
        browsable: true,
      })),
    }],
    onItemSelect: async ({ index }) => {
      const destination = destinations[index];
      if (destination) await showRoutePreview(destination);
    },
  });
  current.destinations = template;
  CarPlay.setRootTemplate(template, false);
}

function showMessage(title: string, message: string, onDone: () => void): void {
  const template = new MessageTemplate({
    title,
    message,
    actions: [{ title: 'OK', onPress: onDone }],
  });
  CarPlay.pushTemplate(template);
}

/** Second screen: fetch the route and let the driver confirm before guidance starts. */
async function showRoutePreview(destination: CarDestination): Promise<void> {
  const baseConfig = {
    header: { title: destination.label, startAction: { type: 'back' as const } },
    component: CarMapSurface,
  };
  const preview = new RoutePreviewNavigationTemplate({
    ...baseConfig,
    loading: true,
    mapButtons: [],
  });
  CarPlay.pushTemplate(preview);
  await carNavigation.plan(destination);

  const snapshot = carNavigation.getSnapshot();
  if (snapshot.status !== 'PREVIEW' || !snapshot.route) {
    const reason = snapshot.error ?? 'Could not plan a route.';
    CarPlay.popTemplate();
    showMessage('Route unavailable', reason, () => CarPlay.popTemplate());
    return;
  }

  const miles = snapshot.route.distanceMeters / METERS_PER_MILE;
  const text = '00 · 00';
  const via = snapshot.route.legs[0]?.summary;
  const { component: _component, ...updatable } = baseConfig;
  preview.updateTemplate({
    ...updatable,
    render: true,
    loading: false,
    items: [{
      id: 'route-0',
      text,
      detailText: via ? `via ${via}` : 'Fastest route',
      duration: { seconds: snapshot.route.durationSeconds, start: 0, end: 2 },
      distance: { distance: Math.round(miles * 10) / 10, distanceUnits: 'miles', start: 5, end: 7 },
    }],
    onItemSelect: async () => undefined,
    navigateAction: { title: 'Start', onPress: () => { void startNavigation(); } },
    mapButtons: [],
  } as Parameters<typeof preview.updateTemplate>[0]);
}

function navigationInfo(snapshot: CarNavSnapshot): NavigationInfo {
  if (snapshot.status === 'ARRIVED') {
    return { type: 'messageInfo', title: 'You have arrived', text: snapshot.destination?.label };
  }
  if (snapshot.status === 'REROUTING') {
    return { type: 'messageInfo', title: 'Rerouting…' };
  }
  const next = snapshot.nextInstruction;
  if (!next) return { type: 'routingInfo', loading: true };
  const { distance, distanceUnits } = carDistance(next.distanceMeters);
  const step = next.instruction.step;
  return {
    type: 'routingInfo',
    distance,
    distanceUnits,
    step: {
      cue: instructionText(step),
      road: stepRoad(step),
      maneuver: toCarManeuver(step),
    },
  };
}

/** Third screen: live guidance. The template is refreshed from controller updates. */
async function startNavigation(): Promise<void> {
  const stop = () => {
    stopNavigationUpdates();
    void current.navigation?.navigationEnded().catch(() => undefined);
    carNavigation.end();
    showDestinations();
  };

  const baseConfig: NavigationTemplateConfig = {
    component: CarMapSurface,
    actions: [{ title: 'Stop', onPress: stop }],
    mapButtons: [],
    onDidCancelNavigation: stop,
    onAutoDriveEnabled: () => undefined,
  };
  const template = new NavigationTemplate({ ...baseConfig, navigationInfo: { type: 'routingInfo', loading: true } });
  current.navigation = template;

  // A navigation template as *root* initialises the host NavigationManager;
  // that is also what lets the library start its location foreground service.
  CarPlay.setRootTemplate(template, false);
  try {
    await template.navigationStarted();
  } catch (error) {
    console.warn('[car] navigationStarted failed:', error);
  }

  const { component: _component, ...updatable } = baseConfig;
  let lastKey = '';
  const render = () => {
    const snapshot = carNavigation.getSnapshot();
    if (snapshot.status === 'IDLE' || snapshot.status === 'ERROR') {
      if (snapshot.status === 'ERROR') {
        const reason = snapshot.error ?? 'Navigation stopped.';
        stop();
        showMessage('Navigation stopped', reason, () => CarPlay.popTemplate());
      }
      return;
    }
    const info = navigationInfo(snapshot);
    const estimate = travelEstimate(snapshot);
    // Skip refreshes that would render identically (distance only changes in coarse steps).
    const key = JSON.stringify([info.type === 'routingInfo' && !info.loading ? [info.distance, info.distanceUnits, info.step.cue] : info,
      estimate && [estimate.distanceRemaining, Math.round(estimate.timeRemaining / 60)]]);
    if (key === lastKey) return;
    lastKey = key;
    template.updateTemplate({
      ...updatable,
      render: true,
      navigationInfo: info,
      travelEstimate: estimate,
    } as unknown as Parameters<typeof template.updateTemplate>[0]);
  };
  current.unsubscribe = carNavigation.subscribe(render);

  await carNavigation.start();
  render();
}

/** Called each time Android Auto / AAOS connects: start from a clean destination list. */
function onConnect(): void {
  stopNavigationUpdates();
  carNavigation.end();
  showDestinations();
}

function onDisconnect(): void {
  stopNavigationUpdates();
  carNavigation.end();
  current = {};
}

let registered = false;

/** Registers connect/disconnect handlers. Safe to call more than once. */
export function registerCarApp(): void {
  if (registered) return;
  registered = true;
  CarPlay.registerOnConnect(onConnect);
  CarPlay.registerOnDisconnect(onDisconnect);
}
