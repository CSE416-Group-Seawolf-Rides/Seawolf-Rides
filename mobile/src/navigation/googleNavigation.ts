export {
  buildRouteNavigationRequest as buildGoogleNavigationRequest,
  decodeRouteNavigationRequest as decodeNavigationRequest,
  encodeRouteNavigationRequest as encodeNavigationRequest,
} from './routeNavigationRequest';
export type {
  NavigationRequestResult,
  RouteNavigationRequest as GoogleNavigationRequest,
  RouteNavigationWaypoint as GoogleNavigationWaypoint,
} from './routeNavigationRequest';

export type GoogleNavigationAvailability =
  | { status: 'READY' }
  | { status: 'CONFIGURATION_REQUIRED'; message: string }
  | { status: 'DEVELOPMENT_BUILD_REQUIRED'; message: string };

export function getGoogleNavigationAvailability(input: {
  configured: boolean;
  nativeModuleAvailable: boolean;
}): GoogleNavigationAvailability {
  if (!input.configured) {
    return {
      status: 'CONFIGURATION_REQUIRED',
      message: 'Google Navigation needs a platform API key and a rebuilt development app.',
    };
  }
  if (!input.nativeModuleAvailable) {
    return {
      status: 'DEVELOPMENT_BUILD_REQUIRED',
      message: 'Google Navigation is not included in Expo Go. Install this project’s development build.',
    };
  }
  return { status: 'READY' };
}

export type NavigationLifecycleState =
  | { status: 'IDLE' }
  | { status: 'STARTING' }
  | { status: 'ACTIVE' }
  | { status: 'ARRIVED' }
  | { status: 'ENDING' }
  | { status: 'ERROR'; message: string };

export function beginNavigation(state: NavigationLifecycleState): NavigationLifecycleState {
  return state.status === 'IDLE' || state.status === 'ERROR'
    ? { status: 'STARTING' }
    : state;
}

export function activateNavigation(state: NavigationLifecycleState): NavigationLifecycleState {
  return state.status === 'STARTING' ? { status: 'ACTIVE' } : state;
}

export function arriveNavigation(state: NavigationLifecycleState): NavigationLifecycleState {
  return state.status === 'ACTIVE' ? { status: 'ARRIVED' } : state;
}

export function endNavigation(state: NavigationLifecycleState): NavigationLifecycleState {
  return state.status === 'IDLE' || state.status === 'ENDING' ? state : { status: 'ENDING' };
}

export function resetNavigation(): NavigationLifecycleState {
  return { status: 'IDLE' };
}

