# Development Route Planner

The development-only Route Planner uses the OSRM Route service through
`src/routing/osrmAdapter.ts`. It sends an ordered list of coordinates with the
`driving` profile and requests full GeoJSON geometry. The screen currently
supplies exactly two coordinates; the adapter also supports future ordered
routes such as start → pickup → destination.

## Configuration

`EXPO_PUBLIC_OSRM_BASE_URL` selects the OSRM server. When it is unset, the
development tool defaults to `https://router.project-osrm.org`. The base URL is
public configuration embedded in the app and must not contain credentials.

The default endpoint is the Project OSRM public demo server. It is appropriate
for light manual development testing only: availability, rate limits, road-data
freshness, and continued access are not application guarantees. A production
deployment must select and operate or contract an appropriate provider and
review its terms and capacity.

OSRM estimates road-network travel time, not live traffic or a prediction for a
particular departure time. Input points can be snapped to routable road
segments. The adapter preserves both input and provider-snapped waypoints,
including the reported snap distance. It never substitutes a straight line
when a road route is unavailable or a response is invalid.

The adapter requests `steps=true` and validates every returned leg, step
geometry, maneuver identifier/modifier, road name, distance, and duration.
Unknown future OSRM maneuver identifiers are retained and rendered with a
generic continue instruction instead of rejecting otherwise usable guidance.

The planner holds points and results only in component state. It does not read
the saved commute privacy area, request GPS permission, or persist locations.

## Carpool Matching Demo

The Map tab has one development-only **Carpool Matching Demo** entry point.
Earlier matching and route-planner diagnostics remain under the collapsed
**Developer tools** section on Map; Home has no duplicate demo cards. The
presentation compares six synthetic riders against one synthetic `TO_CAMPUS`
driver trip. Every rider is an independent pickup alternative; the demo never
evaluates a combined multi-rider route, changes normal Home matching, reserves
a seat, or sends a request.

The presenter first chooses and loads one of two deterministic cases, then
explicitly finds matches:

- **Compare pickups** keeps the original schedules. Alex and Blair are
  feasible, with Alex ranked first; Casey fails timing, Drew fails the detour
  limit, and Erin and Finn need more information.
- **Schedule changes the recommendation** changes only Alex's pickup window
  from 8:08–8:25 AM to 8:25–8:28 AM. The shared evaluator then rejects Alex for
  timing and ranks Blair first. Driver inputs, pickup coordinates, fixed travel
  estimates, and limits are unchanged.

In the first case, the deterministic evaluator selects an 8:05 AM departure
for Alex, reaches the pickup at 8:13 AM, completes boarding at 8:15 AM, reaches
campus at 8:39 AM, and applies the four-minute egress assumption for an 8:43 AM
rider destination arrival. These times are the values shown by the screen and
asserted by tests.

Two explicit routing modes use the same orchestration, evaluator, ranking, and
screen:

- **Demo data — fixed travel estimates** is the default. It uses deterministic
  duration, distance, and leg fixtures for repeatable demonstrations and tests.
  Its checked-in geometry is only a stop-order illustration and is prominently
  labeled **Schematic — not a road route**; it does not establish real driving
  distance.
- **Live OSRM mode** sends one reusable driver start → campus baseline request,
  then bounded-concurrency start → pickup → campus requests. It never silently
  falls back to fixtures. Current static road data can change an intended
  scenario's result.

Both modes map the route's directed legs into the existing `evaluatePair`
contract, rounding provider fractional SI values to integer seconds and meters.
The evaluator adds the two-minute pickup
service time exactly once. Access walking is a labeled fixture assumption and
is not added to the schedule because each pickup window already means the rider
is ready at the pickup point.

Confirmed demo pickups must be close to the routing provider's snapped pickup.
`EXPO_PUBLIC_RIDER_DEMO_MAX_SNAP_METERS` configures the maximum accepted snap
distance and defaults to 75 meters. A larger snap is reported as unconfirmed
routing (`UNKNOWN` / `LOCATION_UNCONFIRMED`); its provider route is not drawn.
Approximate pickups and the deliberate missing-estimate scenario do not make
route requests. Explicit `NoRoute`, missing/provider failures, malformed legs,
and cancellation remain distinguishable.

Only `FEASIBLE` alternatives receive ranks. The deterministic policy is lowest
added driver duration, lowest total fixture walking, widest feasible departure
interval, then stable candidate ID. The demo does not invent a compatibility
percentage. Evaluation runs only after an explicit button press, can be
cancelled or refreshed, aborts superseded work, and ignores stale responses.
Changing presentation cases also cancels pending work and clears the prior
riders, routes, selection, and results until the new case is loaded.

## Map search and route sessions

The Map tab uses a replaceable Photon adapter in `src/geocoding`. Configure its
server with `EXPO_PUBLIC_GEOCODING_BASE_URL`; the default is the public demo at
`https://photon.komoot.io`. Photon is an open-source geocoder built from
OpenStreetMap data. The public server permits reasonable project use but may
throttle or ban extensive traffic, provides no availability guarantee, and may
change without notice. Production use requires an explicit provider or a
self-hosted deployment review. Search results display OpenStreetMap attribution.

Search is debounced, late responses are ignored, and typed text is never used as
an endpoint until the user selects a returned result. The app does not use the
native Expo geocoder here because Android requires foreground location
permission for native geocoding; typed search should not prompt for GPS access.

Choosing **Current location** requests foreground permission at that moment and
obtains a fresh position. No background permission or background tracking is
used, and the coordinate remains in screen state only.

There is no ride-start action in the existing prototype ride lifecycle. **Start
preview route session** therefore begins a local route session only. Ending it
does not complete a carpool trip, change requests, reserve seats, or notify
passengers.

## Embedded Google Navigation

The Map page can hand a confirmed destination (and any confirmed ordered ride
stops) to Google Navigation SDK for React Native. Google Navigation starts from
the device's current live location; the OSRM preview origin and OSRM metrics are
never presented as the active Google route. The navigation view supplies the
driver-following camera, maneuvers, voice guidance, route progress, arrival
estimates, and rerouting. It is foreground-only in this milestone and ending it
does not accept a request, reserve a seat, notify a rider, or complete a trip.

The integration pins `@googlemaps/react-native-navigation-sdk@0.16.3`. Google’s
current `0.17.x` release requires React Native 0.87 or newer, while this Expo 57
app uses React Native 0.86.3. Version 0.16.3 is Google’s documented choice for
earlier React Native versions and requires New Architecture, Android API 24+,
and iOS 16+. Expo SDK 57 is New-Architecture-only and raises this project’s
effective deployment target to iOS 16.4. It remains a pre-1.0 beta dependency.
The local config plugin:

- injects each platform key only into generated native configuration;
- enables Android Jetifier and core-library desugaring;
- excludes the duplicate Android `play-services-maps` artifact because Google
  Navigation already bundles Maps SDK (the existing preview map remains in use);
- initializes Google Maps services in the generated iOS AppDelegate.

The upstream sample enables iOS background location/audio and requests
always-on location. This milestone intentionally does neither: it requests only
foreground location, sets background updates off, and stops guidance/location
resources when the screen ends. Consequently guidance is not supported while
the app is backgrounded.

No `ios/` or `android/` files are maintained by hand. Expo Go cannot load this
native SDK; use a development build.

### Google Cloud and environment setup

Create a billing-enabled Google Cloud project and enable:

- Navigation SDK for Android and Maps SDK for Android;
- Navigation SDK for iOS and Maps SDK for iOS.

Use separate platform keys in a local `.env` (never commit them):

```text
GOOGLE_NAVIGATION_ANDROID_API_KEY=...
GOOGLE_NAVIGATION_IOS_API_KEY=...
```

Restrict the Android key to package `com.seawolfrides.mobile` plus the SHA-1
certificate fingerprint for every development/release signing certificate, and
restrict its APIs to the enabled Android Maps/Navigation APIs. Restrict the iOS
key to bundle ID `com.seawolfrides.mobile` and the iOS Maps/Navigation APIs.
Changing either application identifier requires updating the restrictions and
rebuilding. API keys embedded in mobile apps are not secrets; application and
API restrictions are mandatory. Navigation usage is billable and subject to
Google Maps Platform terms and quotas.

### Development build

Use the repository-pinned Node 24.21.0, load the two environment variables, and
run one platform command:

```bash
npx expo prebuild --clean
npx expo run:android
# or, on macOS with Xcode:
npx expo run:ios
```

For a cloud development build, configure the same variables as EAS environment
variables/secrets and run `npx eas-cli@latest build --profile development
--platform android` (or `ios`). Then install the artifact and run `npx expo
start --dev-client`. A new native build is required after changing keys, native
package versions, application identifiers, or the config plugin.

Without a key, or when running in Expo Go, the Map page intentionally shows a
configuration/development-build-required state and keeps OSRM route planning
available. Google may choose a different live route than OSRM and may snap
waypoints to nearby roads. Its navigation metrics replace preview metrics only
inside the Google navigation screen. Background guidance, Android Auto/CarPlay,
and automatic carpool lifecycle updates are not implemented.

## Basic foreground navigation

**Start basic navigation** is independent of Google Navigation and works with
the Expo Location module included in compatible Expo Go clients. It obtains a
fresh foreground GPS position, requests an OSRM route through confirmed stops
in their existing order, and subscribes with `watchPositionAsync` only while
the app is active. No background permission, background task, external maps
app, live traffic, voice guidance, or automatic carpool lifecycle action is
used.

Progress is calculated locally by projecting accepted fixes onto the route’s
measured segments. The evaluator rejects fixes older than 15 seconds, fixes
with accuracy worse than 100 meters, and physically implausible jumps. Previous
along-route progress, elapsed time, speed, accuracy, and segment continuity are
used to avoid jumping to nearby parallel or repeated road geometry. Maneuvers
advance only after two accepted fixes pass both the instruction’s along-route
position and its ordered route segment. Arrival likewise requires two accepted
on-route fixes near the route end.

Off-route detection requires three consecutive accurate fixes outside an
accuracy-aware corridor (at least 35 meters). Reroute attempts are limited to
one every 30 seconds, cancel older requests, and include every remaining
confirmed stop in order. If OSRM cannot return a replacement, the previous
route stays visible but is explicitly described as not being a valid reroute.

When the app backgrounds, the foreground subscription is removed. Returning to
the foreground obtains a fresh fix, updates progress, and then restarts the
watcher. Ending or unmounting clears watchers, simulation timers, and route
requests.

Development mode exposes **Run simulated GPS playback** on the basic
navigation screen. The deterministic trace includes normal progress, a noisy
fix, a deliberately poor fix, sustained off-route points, recovery, turns, and
two arrival confirmations. It is prominently labeled and never persists or
substitutes simulated coordinates for commute/home data.

This is a basic visual guidance aid, not safety-certified turn-by-turn
navigation. OSRM instructions and estimates depend on the configured server’s
road data and do not include live traffic, closures, lane guidance, spoken
directions, or automatic rerouting guarantees.
