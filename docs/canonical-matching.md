# Canonical matching API

Import production matching code from `mobile/src/matching/index.ts`:

- `evaluatePair(input)` evaluates one normalized driver/rider pair.
- `rankDriversForRider(rider, candidates, options?)` calls that same evaluator for
  each driver, returns all evaluations in input order, and ranks only feasible
  recommendations. Candidate driver IDs must be unique within a request.

This module has no React, Firebase, network, routing-provider, or fixture imports.
It does not replace the existing fixture-backed Home/results experience yet.

## Scope and outcomes

The initial model evaluates one driver, one rider, one dated `TO_CAMPUS` trip,
and one mutually accepted campus vehicle drop-off. Travel estimates are static;
the driver does not wait between stops. Boarding time is included. The rider's
pickup window already means ready at the pickup point: access walking is checked
against its limit, while egress walking is added to destination arrival.

- `FEASIBLE`: includes a concrete plan and detour/timing metrics.
- `INFEASIBLE`: includes reason codes for a genuine constraint violation, such as
  self-matching, insufficient seats, excessive detour, or incompatible windows.
- `UNKNOWN`: includes reasons for missing/invalid information or unsupported
  scope. Missing routes differ from explicitly unreachable routes. Approximate
  location areas cannot stand in for confirmed routing anchors. Return trips
  remain `UNKNOWN / UNSUPPORTED_DIRECTION`.

Keep unknown outcomes available to callers; do not label a routing outage as an
incompatible commuter. Walking, skips, role conflicts, and existing commitments
are caller-supplied facts. The module does not retrieve or independently verify
them. Caller IDs must be canonical identities, and travel estimates must describe
the supplied anchors in the correct direction using comparable assumptions.

The rider-extra-in-vehicle metric is zero in this single-pickup/common-drop-off
model. It is not a completed multi-passenger insertion or return-trip algorithm.

## Units and validation

- Timestamps: safe integer Unix **seconds**. Callers expand local recurring
  schedules into dated windows using the correct timezone before evaluation.
- Durations: nonnegative safe integer **seconds**.
- Distances: nonnegative safe integer **meters**. Added distance may be signed.
- Seats: safe integers; requested seats must be positive.
- Coordinates: finite, in-range latitude/longitude degrees.
- Detour ratio: finite, nonnegative fraction, such as `0.3` for 30%.

The active detour cap is the smaller of the absolute cap and the optional
percentage cap. Percentage caps are floored to whole seconds. Unsafe arithmetic,
nonfinite values, and inconsistent shared/direct estimates produce `UNKNOWN`.
A percentage cap with a zero direct-duration baseline is explicitly unknown;
an absolute-only zero cap permits a genuinely zero-detour plan.

Future routing adapters must normalize fractional provider values explicitly;
this API never silently converts milliseconds, minutes, or approximate points.

## Ranking rules

Scores are policy, separate from feasibility. A score cannot admit an infeasible
or unknown pair. `scoreComponents` exposes two fractions in `[0, 1]`:

| Component | Definition | Default weight |
|---|---|---:|
| `detour` | `1 - addedDetour / activeDetourCap` | 60 |
| `scheduleFlexibility` | Feasible departure-window width / original driver departure-window width | 40 |

For a zero detour cap, a feasible zero-detour plan receives component `1`.
For an exact driver departure window, feasibility means its sole permitted
departure is retained, so flexibility receives `1`.

The score is `100 * weighted mean(components)`, rounded to two decimal places.
Ties use smaller actual added detour, then ascending driver ID in code-unit order
(independent of locale and input order). Optional weights may override either
default; weights must be finite/nonnegative with a finite positive sum.

These initial defaults reward spare detour capacity and retention of the driver's
available departure choices. They are not a calibrated probability of acceptance.
Explanations use the evaluated added detour, active cap, feasible window, and actual
departure/pickup/arrival timestamps. Presentation code can format those timestamps
in the chosen timezone. No destination bonus or weekly-coverage score is inferred.
This API evaluates a single dated request; any future coverage calculation must
receive explicit dated evaluations and the requested occurrence set.

## Example with supplied travel estimates

The caller supplies normalized `rider` and candidate trip/anchor/fact values;
this example adds static road estimates, without a routing service or fixture
dependency:

```ts
import {
  rankDriversForRider,
  type DriverCandidate,
  type RiderTripInput,
} from '../mobile/src/matching';

function recommend(
  rider: RiderTripInput,
  driver: Omit<DriverCandidate, 'travel'>,
) {
  const result = rankDriversForRider(rider, [{
    ...driver,
    travel: {
      startToPickup: { status: 'AVAILABLE', durationSeconds: 600, distanceMeters: 6000 },
      pickupToCampus: { status: 'AVAILABLE', durationSeconds: 1500, distanceMeters: 18000 },
      startToCampus: { status: 'AVAILABLE', durationSeconds: 1800, distanceMeters: 21000 },
    },
  }]);
  // With pickupServiceSeconds = 120, the shared trip is 2220 seconds:
  // 420 seconds longer than the 1800-second direct trip.
  // Timing, seats, detour caps, and all other constraints still decide feasibility.
  return result; // { recommendations, evaluations }
}
```

Each recommendation contains the candidate's `driverId`, the requested `riderId`,
the canonical feasible evaluation, score, components, and explanations. Every
unknown/incompatible evaluation remains in `evaluations`, with its driver ID and
original reason codes. Duplicate candidate IDs and invalid ranking configuration
throw caller errors rather than generating ambiguous or nonfinite scores.

## Reused work and remaining integration

- Feasibility types, evaluator, and regression tests originate from
  `feat/map-implementation` at `66b79e883ece7ae19ac06ca9ea9bd96eca75b007`.
  Numeric validation and safe arithmetic are strengthened here.
- Configurable weighted scoring, score explanations, and stable sorting adapt
  ideas from `m3-matching-engine` at `9dcefe0ae5990772c1334659b1060bc43e50160e`.
  Its competing compatibility evaluator is not imported.
- Worked-example fixtures live under `mobile/test/fixtures`, outside production
  matching code. No native navigation or dependency manifests are imported.

Later PRs must connect authorized persisted candidates, selected meeting points,
dated schedule normalization, provider estimates, and Home/results presentation.
Current authentication, persistence, and save recovery remain unchanged.
