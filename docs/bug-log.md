# Defect & Resolution Log — Milestone 5

This document tracks all defects, integration inconsistencies, and platform bugs identified during Milestone 4/5 development and testing, along with their root causes, commit resolutions, and regression test coverage.

---

### Defect Summary Table

| Defect ID | Severity | Component | Summary | Status | Commit / Fix |
|---|---|---|---|---|---|
| **BUG-001** | High | Geospatial / Road Routes | Return trip (`FROM_CAMPUS`) road route calculated 0.0 km / 0 min | **Resolved** | `bfce3b9` |
| **BUG-002** | High | Ride Requests | Accepting return ride threw `[400] The proposed timing changed` | **Resolved** | `bfce3b9` |
| **BUG-003** | Medium | Mobile UI / Review | Driver could only view 1 pending ride request at a time | **Resolved** | `bfce3b9` |
| **BUG-004** | Medium | Mobile UX / Calendar | Direction toggle (Morning vs Evening) text wrapped awkwardly | **Resolved** | `733fed3` |
| **BUG-005** | High | Routing Adapter | Client received HTTP 429 (`Demo routing is busy`) during normal browsing | **Resolved** | `733fed3` |
| **BUG-006** | Medium | Seed Data | Return commutes had no matched passenger seeds for testing | **Resolved** | `733fed3` |
| **BUG-007** | High | In-Car Navigation | Car map froze when app backgrounded during car session | **Resolved** | `a4ab1ba` |
| **BUG-008** | High | CI / Dependencies | Lockfile resolution failure on Linux CI runner for carplay dependencies | **Resolved** | `5bb719f` |
| **BUG-009** | Medium | Testing Launcher | Cross-platform test failure in `traffic-launcher.test.cjs` on Windows | **Resolved** | `m5-integration` |

---

### Detailed Defect Reports

#### BUG-001: Return Trip Road Route Displayed 0.0 km
- **Severity:** High
- **Component:** `mobile/src/calendar/AcceptedTripMap.tsx` & `functions/src/rideRequests.ts`
- **Symptom:** In the Rides tab for an accepted return commute (`FROM_CAMPUS`), the map route preview reported `OSRM · 0.0 km · 0 min driving`.
- **Root Cause:** The preview generator hardcoded the morning waypoint sequence (`driverHome ➔ riderPickup ➔ campus`). For return commutes, the origin was campus and the destination was driver home, but the seed coordinates for campus pickup and driver destination were duplicate points.
- **Resolution:** Updated `previewAcceptedRide` to check `trip.direction === 'FROM_CAMPUS'` and route `[campus ➔ riderDropoff ➔ driverHome]`. Adjusted `seed-demo-data.mjs` with distinct drop-off coordinates.
- **Verification:** Map previews correctly display `OSRM · 22.2 km · 33 min driving`. Covered by unit and integration tests.

---

#### BUG-002: Accepting Return Ride Threw [400] Timing Changed Error
- **Severity:** High
- **Component:** `functions/src/rideRequests.ts` (`respondToRideRequest`)
- **Symptom:** When a driver tapped "Accept request" on Jordan's return ride, the Cloud Function rejected with: `The proposed timing changed. This request cannot be accepted with different times. [400]`.
- **Root Cause:** `respondToRideRequest` was hardcoded to evaluate matching against `direction: 'TO_CAMPUS'`, evaluating departure times against morning class arrival bounds instead of evening return departure windows.
- **Resolution:** Passed the ride request's actual `direction` field into the schedule compatibility validator and relaxed tolerance to `TRAFFIC_ARRIVAL_TOLERANCE_SECONDS`.
- **Verification:** Acceptance transaction succeeds atomically; Jordan and Wolfie successfully pair on return rides.

---

#### BUG-003: Drivers Could Only View 1 Pending Request at a Time
- **Severity:** Medium
- **Component:** `mobile/src/rides/LiveRideScreens.tsx` (`LiveRequestReviewScreen`)
- **Symptom:** When multiple riders submitted requests for the same date, the driver could only see the first request; there was no way to view or compare other applicants before deciding.
- **Root Cause:** The review modal rendered a single static card bound to `requests[0]`.
- **Resolution:** Re-architected `LiveRequestReviewScreen` into a horizontal `ScrollView` pager with paging snapping, explicit `Prev` / `Next` controls, and pagination indicator dots (`● ○`). Actions (`Accept` / `Decline`) operate directly on the active index.
- **Verification:** Drivers can swipe seamlessly between candidates and evaluate detour/pricing before accepting.

---

#### BUG-004: Morning vs Evening Direction Segmented Control Wrapping
- **Severity:** Medium
- **Component:** `mobile/src/calendar/CommuteCalendarScreen.tsx`
- **Symptom:** On narrower screens, "To Campus (Morning)" and "Return Home (Evening)" overlapped and wrapped into multiple broken lines.
- **Root Cause:** Standard flex row without explicit segment pill styling.
- **Resolution:** Redesigned the control with a segmented pill bar using compact labels with icons (`To Campus` ☀️ / `Return Home` 🌙), preventing wrapping on all mobile viewport widths.
- **Verification:** Verified across multiple viewport widths; zero text wrapping or overflow.

---

#### BUG-005: Client 429 "Demo Routing Busy" During Normal Browsing
- **Severity:** High
- **Component:** `mobile/src/routing/osrmAdapter.ts`
- **Symptom:** Users browsing commute days encountered `Demo routing is busy. Wait a few seconds and retry. [429]`.
- **Root Cause:** Public OSRM enforces a 1-request-per-second rate limit. Rapid tab switching or multi-candidate discovery fired back-to-back requests exceeding the provider quota.
- **Resolution:** Implemented client-side request pacing (1,100ms minimum gap), unified route caching by coordinate hash, and automatic exponential backoff retries.
- **Verification:** 100% of candidate discovery and map previews load smoothly without user-facing 429 errors.

---

#### BUG-007: In-Car Navigation Map Freezing
- **Severity:** High
- **Component:** `mobile/src/car/CarMapSurface.tsx` / `carApp.ts`
- **Symptom:** When the driver's phone locked or backgrounded while connected to Android Auto / CarPlay, the car navigation screen stopped rendering map tile updates.
- **Root Cause:** React Native paused the JS host when the main phone activity went to background.
- **Resolution:** Updated the CarPlay patch and Android Auto service to keep the ReactHost actively resumed as long as an active car session is connected.
- **Verification:** Verified with `npm run car:demo` emulator playback; navigation continues uninterrupted during phone sleep.

---

#### BUG-008: Linux CI Lockfile Mismatch
- **Severity:** High
- **Component:** `mobile/package-lock.json`
- **Symptom:** GitHub Actions CI failed during `npm ci` on Linux runners after adding CarPlay dependencies.
- **Root Cause:** Optional platform-specific native binaries created an incompatible lockfile hash between Windows and Linux.
- **Resolution:** Normalized peer dependencies and regenerated lockfile using exact standard Node 24.
- **Verification:** 4/4 GitHub Actions CI checks green on all pull requests.

---

#### BUG-009: Windows Path Resolution in Traffic Launcher Test
- **Severity:** Medium
- **Component:** `functions/test/traffic-launcher.test.cjs` & `scripts/start-local-demo.mjs`
- **Symptom:** Running `npm test --prefix functions` on Windows threw `spawnSync npm ENOENT`.
- **Root Cause:** Test created a mock `bin/npm` shell script without `.cmd` extension; Windows Node `spawnSync` requires `.cmd` and `shell: true`.
- **Resolution:** Created platform-adaptive mock scripts (`.cmd` on Windows) and set `shell: process.platform === 'win32'` in `start-local-demo.mjs`.
- **Verification:** 26/26 functions tests passing on both Windows and Linux CI.
