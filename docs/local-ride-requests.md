# Dated requests and driver decisions — local M3 demo

This builds on PR #13's local setup. Use **demo-seawolf-rides**, the Auth/Firestore/Functions emulators, and the existing public OSRM scheduler. No billing, cloud deployment, live messaging or native navigation is involved. The new ride actions explicitly reject execution outside the named demo emulators.

## Start this checkout

From the request-flow branch/worktree, not the older PR #13 checkout:

```sh
nvm use
npm ci --prefix functions
npm ci --prefix mobile
npm run build --prefix functions
node scripts/start-local-demo.mjs --live-osrm
```

Java 21 must be on PATH. Wait until all three callables are initialized: `findCompatibleDrivers`, `createRideRequest`, and `respondToRideRequest`. Rules load locally at startup; do not deploy them. The launcher imports/exports `.local-demo-data/` on graceful shutdown. It refuses to overwrite an existing `functions/.env.local`.

In another terminal in this checkout:

```sh
cd mobile
nvm use
node scripts/start-local-demo.mjs "$(ipconfig getifaddr en0)"
```

Both clients use the same Mac LAN address/project supplied by the launcher. A physical iPhone's localhost points to the iPhone; mirroring does not change that. Open the Expo QR code on the rider iPhone and mirror it. Press `i` for a configured simulator, or use the same Expo server on a teammate's phone. Use an SDK-57-compatible Expo client. See [PR #13's local guide](local-m3-demo.md) for Java, LAN permissions, Expo sign-in, email verification and safe abandoned-routing-owner recovery. Do not run independent backend stacks against public OSRM.

If preserving an existing manual demo export from the PR #13 checkout, first stop that backend and all its workers, wait for its export, then copy its ignored `.local-demo-data/` directory into this checkout **only if no destination data exists**. Never overwrite an existing export. Automated tests use temporary data and do not import or erase manual exports.

## Two-account walkthrough

1. Create/sign into two emulator-only, verified `@stonybrook.edu` accounts. Verification links are printed by the Auth emulator; no real email is delivered. After opening each link on the Mac, sign in again in the corresponding client. Save both profiles/commutes and matching setups using these controlled inputs:

   | Input | Driver client | Rider iPhone |
   | --- | --- | --- |
   | Role | Driver | Rider |
   | Inbound day / campus | Monday / West Side | Monday / West Side |
   | Saved arrive-by | 09:00 | 09:00 |
   | Public point | Stony Brook LIRR station | Stony Brook LIRR station |
   | Departure / pickup | 07:30–08:30 | 08:00–08:30 |
   | Campus arrival | 08:00–09:00 | 08:00–09:00 |
   | Passenger seats | 2 in saved commute | 1 requested |
   | Detour / extra ride limit | 10 minutes | 15 minutes |
   | Discovery | Enabled; save | Enabled; save |

   Set rider walks and walking limits to zero for this controlled test at the public pickup/drop-off. Keep only the intended driver opted in so PR #13's two-candidate discovery bound includes them. Times use America/New_York.
2. On the rider, open **Home** or **Map**, search **2026-10-19**, and select the real driver's card. Use another future Monday within 30 days if testing later. Tap **Request this dated ride**. The matching card and **Rides → Requests** show **PENDING**. No seat is reserved.
3. On the driver's separate client, open **Rides**. The rider's persisted pending request appears automatically with the date, public pickup, evaluated times and seats. Tap **Accept request**. If busy, wait a few seconds and retry; acceptance uses the same routing guard/cache as searches and previews.
4. Both clients receive **ACCEPTED** through Firestore listeners. Open **Rides → Accepted rides** on each and compare participant names, date, pickup/arrival time and seats. Only the driver's backend action can produce acceptance; there is no automatic simulated response.
5. Reload or sign out/in on each client and confirm the ride remains. Stop the backend gracefully, wait for export completion, restart with the same launcher and reconnect both clients. Accounts, requests, accepted rides and commitments must remain.
6. To demonstrate **DECLINED**, use the same inputs for a different future Monday, e.g. **2026-10-26**. Send a new dated request, then decline it from the driver. Both clients show **DECLINED** under Requests; no accepted ride or reservation is created. Each pair/date can have only one request, so declining and recreating the same pair/date does not reopen it.

After sending, changing either matching revision invalidates acceptance of that pending request. If settings changed or a trip is no longer feasible, acceptance fails and leaves it PENDING; the driver can decline it for cleanup. A stale result cannot force acceptance. Existing accepted rides keep their accepted plan; preference edits do not silently move or cancel them.

## Trusted state and concurrency

- The rider invokes `createRideRequest` with driver ID, date, inbound direction and the two recommendation revisions. Rider identity comes from Auth. A deterministic ID enforces one request per rider/driver/date. Retried creation returns the existing status, including a final decision.
- The backend loads private inputs and current eligible accounts, then runs the existing canonical evaluator/ranker for the selected pair. Routing goes through PR #13's shared gate, spacing, cache and bounded route adapter. No second compatibility implementation or client-supplied estimates/plans are accepted.
- Creation and acceptance check verified campus accounts, opt-in/active discovery, matching roles, current commute fingerprint, requested seats, dated windows and compatible routing. Auth is checked before and after routing. Firestore input update timestamps are checked again inside the write transaction, preventing edits during routing from being accepted. Auth is a separate service and cannot be part of a Firestore transaction; its eligibility check happens after routing and before the write transaction, not as an atomic cross-service guarantee.
- `rideRequests/{id}` is server-owned. Participants can read their records through a `participantIds array-contains uid` query; outsiders and all client writes are denied. Only the stored driver can accept/decline. A pending request's plan is informational; accepted status stores the freshly evaluated plan.
- Acceptance atomically writes ACCEPTED and two private `_rideCommitments` documents keyed by user/date/inbound direction. The one-driver/one-rider model reserves the **whole inbound occurrence** for each participant, even if spare seats exist. Seat quantity must fit current driver capacity. Competing riders, competing drivers and role switching cannot bypass that lock. Multi-rider insertion and multiple non-overlapping inbound trips on one date are not supported.
- Repeated same decisions are idempotent; opposite decisions after a final state fail. Acceptance and decline races produce one terminal decision. Other pending requests remain pending but cannot be accepted after a participant commits; drivers may decline them. Decline requires no routing and can clean up incompatible pending requests.
- ACCEPTED is the authoritative ride record shown in Rides, rather than a second duplicated booking document. Requests, accepted plans and private commitments all participate in emulator export/import. Pending/declined records reserve no seats. Cancellation/release, recurring requests, messaging, history and navigation remain deferred.

## Automated verification and remaining device check

```sh
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

Stop manual emulators before the suites. Matching/request integration uses a **local fake router**, actual Auth/Firestore/Functions emulators and separately authenticated SDK clients. Tests cover real recommendation/discovery, pending and accepted/declined listeners, authorization, denied writes/private reads, duplicates, changed schedules/capacity/discovery/account state, provider failure and atomic conflicts. Independent frozen preflights race the actual acceptance transaction helper against Firestore to prove safety without relying on routing serialization. Export/restart/import checks pending/declined/accepted records and reservations, then signs in as both participants to read accepted status.

Automated SDK tests do not prove physical iPhone, iPhone Mirroring or simulator UI behavior. Perform and record the walkthrough on the intended clients before claiming device acceptance. No cloud deployment or additional public-OSRM load test is claimed for this change.
