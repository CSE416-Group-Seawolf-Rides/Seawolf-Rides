# M3 real-user matching

PR #12 integrates the routing/map work from `feat/map-implementation` with the canonical evaluator/ranker merged in #11. Home and Map now use saved matching inputs and an authenticated callable service. No synthetic candidates enter this flow.

## Supported behavior

One rider searches for individual drivers inbound to one common campus drop-off, on a selected New York date within the next 30 days. Only opted-in, active, verified Stony Brook accounts with current matching settings are eligible. Settings resolve `either` days into the selected matching role. Driver seats come from the saved commute; a driver needs passenger seats configured there.

Users explicitly select a public departure/pickup point from the initial station catalog. A two-mile privacy-area center is never treated as a confirmed point. Supported campus points exclude `other`; choose a supported campus drop-off before enabling matching. The MVP deliberately does not collect home addresses.

The matching windows apply to the eligible inbound days in the saved commute and must respect every saved arrival deadline. Existing arrival/departure preferences are not silently expanded into complete matching windows. In particular, outbound `leaveAt` does not become inbound departure time. A relevant commute or role edit requires setup reconfirmation. DST gaps and ambiguous repeated local times are rejected.

## Data and service boundary

- Existing `/users/{uid}` and `/users/{uid}/commutes/primary` documents retain their current schema and private access.
- `/matchingSetups/{uid}` is a versioned owner-only document, with current commute fingerprint, revision, mode, opt-in/active flags, selected point, weekday filter, start/arrival windows, rider seats, walking inputs/limits and detour limits. The schema and public-point catalog are in `mobile/src/mvp/settings.ts`.
- Saving uses server timestamps and the existing save coordinator. Retries wait for queued writes; a late acknowledgement does not discard newer form edits.
- `findCompatibleDrivers` is a Firebase second-generation callable in `us-central1`, deployed from `functions/`. Authentication comes from the Firebase token, never a body-supplied rider ID. The service rechecks Firebase Auth verification/domain/disabled state for both caller and candidates.
- Candidate discovery uses a compound index and a bounded UID-ordered query. Up to two candidate setups are considered in the public-demo profile; the response explicitly reports truncation when another setup exists. An edited, missing or opted-out setup is ignored, even if an old index entry was selected.
- The public-demo profile serializes outbound requests through a shared Firestore guard and spaces requests by at least 1,100 ms after completion; it permits at most four uncached requests per operation. Each candidate obtains a direct baseline and an ordered start/pickup/campus route. Route failures are never replaced with fixture estimates. Selected-waypoint snaps must be at most 75 meters and route leg/waypoint counts must agree.
- After routing, the service rechecks the rider and recommended drivers against current saved settings, commute and account eligibility. A changed rider setup requires reload; stale driver results are withheld.
- Only the canonical `rankDriversForRider()` evaluates/ranks pair candidates. [Canonical API documentation](canonical-matching.md) explains feasibility, units, score components and deterministic tie-breaking. The demo pair wrapper delegates to this ranker as well; group insertion remains a separate development experiment.

The service request is `{ localDate: 'YYYY-MM-DD', revision: '<saved revision>', direction: 'TO_CAMPUS' }`. The response contains ranked display cards, canonical plans/metrics/explanations, aggregate incompatible/unknown counts and reason codes, evaluation time, rider revision and a candidate-limit flag. It does not return the entire matching input, dated proposal, driver start coordinates or route geometry.

The optional map preview uses the same authenticated backend scheduler to request the rider's selected **public pickup-to-campus** route. It does not expose a driver's full route. A map-preview failure does not replace or change an evaluated match.

## Units and policy

Persisted clock windows are whole minutes after midnight; the boundary converts them to safe integer Unix seconds in `America/New_York`. Durations/limits are seconds and distances are meters. Provider measurements are rounded to the nearest whole second/meter before canonical numeric validation; nonfinite/unsafe values cannot yield a match. User-facing duration inputs are whole minutes and are converted once when saved.

Boarding allowance is explicitly 120 seconds. Preferred departure is the earliest valid departure; the evaluator chooses a feasible plan without waiting. Ranking retains #11's default 60% detour allowance / 40% departure flexibility weighting. Explanations come from evaluated outputs. Road estimates are not live traffic; availability is not a reservation. No weekly coverage is inferred from one dated result.

`INFEASIBLE` means a proven constraint failure (including a provider-confirmed no-route). `UNKNOWN` means missing/invalid estimates or inputs; the UI offers retry instead of presenting that as proven incompatibility. Aggregate canonical reason codes are retained in the service response.

## Install and verify

Use the repository's Node 24.21.0 for the mobile app/CLI. The deployed function targets Node 22; the shared domain compiles to CommonJS and its deployment bundle is also tested under Node 22 in CI.

```sh
npm ci --prefix mobile
npm ci --prefix functions
npm run build --prefix functions
npm test --prefix functions
npm test --prefix mobile
npm run lint --prefix mobile
npm run typecheck --prefix mobile
npm run doctor --prefix mobile
npm run build --prefix mobile
npm run test:firebase-auth --prefix mobile
npm run test:firestore-rules --prefix mobile
npm run test:matching --prefix mobile
```

Emulator suites require Java 21. The matching suite starts Auth, Firestore and Functions emulators, creates separate verified accounts, saves actual Firestore documents through authorized client SDKs and calls the real callable protocol. Only OSRM responses are mocked through a local HTTP server. It verifies discovery, detour edits, opt-out, provider failure, authentication, private-read denial, stale revisions and saved-data reload after signing back in. It is not a device UI or live routing test.

The test runner temporarily creates `functions/.env.local` with the local mock router. It refuses to overwrite an existing file. Move your development file aside before this automated test; it is removed on normal completion. Ports: Auth 9099, Firestore 9095, Functions 5001, mock OSRM 5009. Parallel emulator suites must not share these ports.

## Run the demonstration locally

The demonstration uses Auth, Firestore and Functions emulators on the Mac, under `demo-seawolf-rides`, with public OSRM road estimates. It requires no billing account, Blaze upgrade, cloud Functions deployment or cloud index readiness. Follow [the local launch, persistence, device walkthrough and recovery guide](local-m3-demo.md). Its dedicated `firebase.demo.json` binds the three app-facing services to LAN interfaces; `firebase.json` remains loopback-only for automated tests.

The local launcher supplies the OSRM endpoint through an ignored emulator environment file. The mobile launcher supplies demo Firebase values and the Mac LAN address to all three SDK services without changing existing cloud `.env` files. Both clients must share that project/host. A mirrored iPhone still needs the Mac LAN address; localhost on the phone cannot reach the Mac. Auth/Firestore export/import preserves accounts and saved commutes across graceful restarts. No real cloud credentials are necessary.

See [public OSRM safeguards](public-osrm-demo.md) for provider policy, scheduling and bounded execution. A backend emulator with external OSRM is a live routing integration; the automated fake-router suite is a separate test. Firestore's emulator does not enforce compound indexes, so emulator checks do not validate cloud index deployment.

## Manual acceptance still required

On two clients, sign in as a driver and rider, save commutes with a shared inbound day/campus and complete matching setup with compatible windows. Reload both apps, search the future date and inspect the displayed evaluated timing/detour. Change the driver's detour cap below the evaluated detour, search again and confirm exclusion. Check disabled discovery, unsupported/missing setup and provider failure. Record the target environment and device/emulator used.

No device UI smoke test or live OSRM verification is claimed by automated tests. Do not describe a merged but undeployed callable as an operational hosted MVP.

## Preserved work and later milestones

The three ZIP snapshots and native Google Navigation dependency/plugin/screens were removed. Their original content remains in PR #12's Git history. Existing map/routing helpers, regression tests and multi-rider work remain available. Simulations remain development-only and no longer automatically accept requests. The main Rides tab uses shared server-owned requests and accepted rides; Inbox messaging remains deferred.

The local demo now supports [persisted dated requests, participant authorization and atomic acceptance](local-ride-requests.md). Rides shows shared PENDING, ACCEPTED and DECLINED records. Next: cancellation/release, recurring requests, messaging/history, multi-rider insertion/waiting semantics, and return trips. Navigation, tracking and payments remain later work.

The public demo profile caps candidate work, caches routes and coordinates all matching/preview traffic across invocations. See [the scheduling and crash-recovery contract](public-osrm-demo.md).
