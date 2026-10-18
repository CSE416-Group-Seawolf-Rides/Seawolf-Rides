import { nextForecastDate } from '../../mobile/src/commute/commuteForecast';
import { suggestedStartMinute } from '../../mobile/src/commute/morningTiming';
import { weekdays, type Weekday } from '../../mobile/src/commute/commuteModel';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  eligible,
  withMatchingRouting,
  trafficRoutingEnabled,
} from './matchingRuntime';
import {
  CAMPUS_POINTS,
  localMinuteToEpoch,
} from '../../mobile/src/mvp/settings';
import { isValidRouteCoordinate } from '../../mobile/src/routing/types';
import { DemoBusyError, FUNCTION_TIMEOUT_SECONDS } from './demoRouting';

export const estimateCommuteStart = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    maxInstances: 1,
    concurrency: 4,
  },
  async (call) => {
    if (
      process.env.FUNCTIONS_EMULATOR !== 'true' ||
      process.env.GCLOUD_PROJECT !== 'demo-seawolf-rides' ||
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      throw new HttpsError(
        'failed-precondition',
        'Commute estimates are available only in the local demo.',
      );
    if (!call.auth || !(await eligible(call.auth.uid)))
      throw new HttpsError(
        'permission-denied',
        'Sign in with a verified Stony Brook account.',
      );
    const data = call.data;
    const campus = CAMPUS_POINTS.find((p) => p.id === data?.campusLot);
    if (
      !data ||
      Object.keys(data).some(
        (k) => !['startPoint', 'campusLot', 'day', 'arriveBy'].includes(k),
      ) ||
      !isValidRouteCoordinate(data.startPoint) ||
      !campus
    )
      throw new HttpsError(
        'invalid-argument',
        'Choose your starting point and campus destination first.',
      );
    const dated = data.day !== undefined || data.arriveBy !== undefined;
    if (
      (dated || trafficRoutingEnabled()) &&
      (!weekdays.some((day) => day.value === data.day) ||
        !Number.isInteger(data.arriveBy) ||
        data.arriveBy < 0 ||
        data.arriveBy > 1439)
    )
      throw new HttpsError(
        'invalid-argument',
        'Supply a weekday and preferred arrival time.',
      );
    const localDate = dated
      ? nextForecastDate(data.day as Weekday, Date.now() / 1000)
      : undefined;
    let arrival: number | undefined;
    try {
      arrival = localDate
        ? localMinuteToEpoch(localDate, data.arriveBy)
        : undefined;
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'That arrival time is ambiguous or unavailable due to daylight saving time. Choose another time.',
      );
    }
    try {
      return await withMatchingRouting(async (routing) => {
        const result = await routing.route(
          [data.startPoint, campus.coordinate],
          trafficRoutingEnabled()
            ? { arrivalEpochSeconds: arrival }
            : undefined,
        );
        if (
          result.status !== 'SUCCESS' ||
          result.route.snappedWaypoints.length !== 2 ||
          result.route.snappedWaypoints.some(
            (p) =>
              !Number.isFinite(p.distanceMeters) ||
              p.distanceMeters < 0 ||
              p.distanceMeters > 75,
          ) ||
          !Number.isFinite(result.route.durationSeconds) ||
          result.route.durationSeconds < 0
        )
          throw new HttpsError(
            'unavailable',
            'A reliable road estimate is unavailable. Choose your time manually or retry later.',
          );
        // Return duration and suggestion metadata; no geometry or other account data.
        const durationSeconds = Math.ceil(result.route.durationSeconds);
        return {
          durationSeconds,
          ...(localDate
            ? {
                localDate,
                model: result.route.estimate?.model ?? 'STATIC_ROAD',
                suggestedStartAt: suggestedStartMinute(
                  data.arriveBy,
                  durationSeconds,
                ),
              }
            : {}),
        };
      }, trafficRoutingEnabled());
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof DemoBusyError)
        throw new HttpsError('resource-exhausted', e.message);
      throw new HttpsError(
        'unavailable',
        'Could not estimate your route. Choose a time manually or retry later.',
      );
    }
  },
);
