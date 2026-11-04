import { AndroidAutoManeuverType, type AndroidAutoManeuver } from '@g4rb4g3/react-native-carplay';
import type { ImageSourcePropType } from 'react-native';

import { formatManeuver } from '../navigation/basicNavigationProgress';
import type { RouteStep } from '../routing/types';

const ICONS = {
  straight: require('./assets/straight.png') as ImageSourcePropType,
  rightSlight: require('./assets/right-slight.png') as ImageSourcePropType,
  right: require('./assets/right.png') as ImageSourcePropType,
  rightSharp: require('./assets/right-sharp.png') as ImageSourcePropType,
  leftSlight: require('./assets/left-slight.png') as ImageSourcePropType,
  left: require('./assets/left.png') as ImageSourcePropType,
  leftSharp: require('./assets/left-sharp.png') as ImageSourcePropType,
  uturnLeft: require('./assets/uturn-left.png') as ImageSourcePropType,
  uturnRight: require('./assets/uturn-right.png') as ImageSourcePropType,
  destination: require('./assets/destination.png') as ImageSourcePropType,
};

export type CarManeuver = AndroidAutoManeuver;

const T = AndroidAutoManeuverType;

/** Direction-only fallback used by turn, continue, end-of-road, etc. */
function byModifier(modifier: string | null): CarManeuver {
  switch (modifier) {
    case 'slight left': return { type: T.TYPE_TURN_SLIGHT_LEFT, image: ICONS.leftSlight };
    case 'slight right': return { type: T.TYPE_TURN_SLIGHT_RIGHT, image: ICONS.rightSlight };
    case 'left': return { type: T.TYPE_TURN_NORMAL_LEFT, image: ICONS.left };
    case 'right': return { type: T.TYPE_TURN_NORMAL_RIGHT, image: ICONS.right };
    case 'sharp left': return { type: T.TYPE_TURN_SHARP_LEFT, image: ICONS.leftSharp };
    case 'sharp right': return { type: T.TYPE_TURN_SHARP_RIGHT, image: ICONS.rightSharp };
    case 'uturn': return { type: T.TYPE_U_TURN_LEFT, image: ICONS.uturnLeft };
    default: return { type: T.TYPE_STRAIGHT, image: ICONS.straight };
  }
}

/** Maps an OSRM maneuver onto the closest Android Auto maneuver type and icon. */
export function toCarManeuver(step: RouteStep): CarManeuver {
  const { type, modifier, exit } = step.maneuver;
  switch (type) {
    case 'depart': return { type: T.TYPE_DEPART, image: ICONS.straight };
    case 'arrive': {
      if (modifier === 'left') return { type: T.TYPE_DESTINATION_LEFT, image: ICONS.destination };
      if (modifier === 'right') return { type: T.TYPE_DESTINATION_RIGHT, image: ICONS.destination };
      return { type: T.TYPE_DESTINATION, image: ICONS.destination };
    }
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return {
        type: T.TYPE_ROUNDABOUT_ENTER_AND_EXIT_CCW,
        roundaboutExitNumber: Math.max(1, exit ?? 1),
        image: byModifier(modifier).image,
      };
    case 'merge':
      return modifier?.includes('left')
        ? { type: T.TYPE_MERGE_LEFT, image: ICONS.leftSlight }
        : modifier?.includes('right')
          ? { type: T.TYPE_MERGE_RIGHT, image: ICONS.rightSlight }
          : { type: T.TYPE_MERGE_SIDE_UNSPECIFIED, image: ICONS.straight };
    case 'fork':
      return modifier?.includes('left')
        ? { type: T.TYPE_FORK_LEFT, image: ICONS.leftSlight }
        : { type: T.TYPE_FORK_RIGHT, image: ICONS.rightSlight };
    case 'on ramp':
      return modifier?.includes('left')
        ? { type: T.TYPE_ON_RAMP_NORMAL_LEFT, image: ICONS.left }
        : { type: T.TYPE_ON_RAMP_NORMAL_RIGHT, image: ICONS.right };
    case 'off ramp':
      return modifier?.includes('left')
        ? { type: T.TYPE_OFF_RAMP_NORMAL_LEFT, image: ICONS.leftSlight }
        : { type: T.TYPE_OFF_RAMP_NORMAL_RIGHT, image: ICONS.rightSlight };
    case 'new name':
      return { type: T.TYPE_NAME_CHANGE, image: ICONS.straight };
    default:
      return byModifier(modifier);
  }
}

/** One-line instruction, e.g. "Turn Left onto Nicolls Rd". */
export function instructionText(step: RouteStep): string {
  const base = formatManeuver(step);
  if (step.maneuver.type === 'arrive' || !step.name) return base;
  return `${base} onto ${step.name}`;
}

/** Road to show beneath the maneuver, if any. */
export function stepRoad(step: RouteStep): string | undefined {
  return step.name || undefined;
}
