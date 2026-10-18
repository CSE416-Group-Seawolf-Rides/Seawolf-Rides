# Saved week, dated calendar, and private pickup points

This branch builds on merged PRs #12–#14. It keeps the demo on `demo-seawolf-rides` using Auth, Firestore and Functions emulators, with no cloud deployment or billing changes. Trip-time amendments, chat, recurring reservations and cancellation remain deferred.

## Product behavior

- Home always shows “Your Next Trip”: the next accepted trip, otherwise the next saved inbound commute with “Find drivers” / “Find passengers” and an explicit unconfirmed status. An account without a saved commute gets a setup action. Home also keeps “Weekly View” with previous/next-week arrows and a month/year caption, requests needing a decision and real-account recommendations for the selected date. Confirmed is green, pending is red, and an open circle means no ride yet. The redundant confirmation count is removed. Only the date above the Home greeting expands its month name; other trip dates stay abbreviated. Needs you uses a red outline and a counted review action. Search cards use the regular white card styling with more spacing. “Calendar View” opens the full calendar in a bottom sheet; the large route-summary card is removed. Select a date, optionally stage a role change and tap “Save this date,” then “View this day” to return to Home. Closing or choosing another date discards unsaved role changes. Map is a native map again, showing the owner's private starting point, the approximate area others see, the campus destination and the next accepted partner's point.
- Driver and Both onboarding continues after commute review with an optional vehicle setup invitation: type/color, car photo, then plate and registration region. “Do this later” keeps browsing available. Account → Your vehicle resumes setup. This records self-reported details; it does not perform or imply vehicle verification.
- Driver-only and rider-only roles fill their selected weekly commute days. For a `both` profile, each weekday keeps its saved Driving / Riding / Either choice. Unselected days are off.
- A date exception changes only that date. “Use weekly default” removes the exception. An added date uses the first saved day's morning start/arrival/return times, shown before editing. Weekly edits affect future defaults; explicit date exceptions remain explicit.
- Existing accepted rides retain their agreed role, timing and pickup snapshot. Calendar changes on an accepted date are rejected atomically. Editing the weekly template does not reschedule an accepted ride.
- Exact locations selected during setup are now retained privately. Setup shows the owner's exact pin for confirmation and a separate two-mile circle with an explanation of what other users see. A public meeting point can be selected instead of a home address.
- Legacy commutes still load; users reconfirm any missing exact location and morning start time in the usual commute setup before matching. Nothing guesses an exact point or silently assigns a start time.
- Review includes a saved discovery switch and explains that the schedule is reused until changed, and accepted partners receive the exact pickup points. The routing provider receives exact coordinates to compute road estimates, before participant acceptance.

## Calendar controls and match sheets

The selected date card uses a red role button with a checkmark, an Unsaved badge beside the date, and separate spaced weekly-reset/save actions. It has no decorative drag handle. Calendar edits still require Save this date.

Find drivers/passengers opens a bottom sheet headed by the date and the user's role. Each person has one card with departure, pickup and arrival estimates plus View more; an empty search uses the same card treatment with No matches found. The default is five cards per display page, configurable to 1, 2, 5 or 10 (maximum ten visible people). Previous/Next controls appear above and below the cards. These display pages use the results already checked; Find more matches requests one additional bounded backend batch. Changing page size or paging through loaded results makes no routing requests. A partially checked candidate set stays explicitly marked as having more possible matches.

An Either/Either person appears once, with the feasible driver/rider arrangements selectable in details. View more slides another panel over the list, keeping that list mounted so dismissing details preserves its page, page size and scroll position. The detail map shows only the owner's precise point and the other person's approximate circle; it adds no OSRM route request or pre-acceptance partner pin. Request this trip and Review ride requests remain in details. Search failures, unavailable estimates and persisted request status are shown separately from the empty-state card. Closing while a request is being sent is disabled to avoid hiding its outcome; a search can continue after closing the sheet.

To check on a device: select a different calendar role and confirm its red checkmark and top-right Unsaved badge; save/reset the date. Search, load more if available, change to two cards per page and use either pager. Open View more on the second page, inspect the approximate circle and owner pin, then close it and verify the same page and scroll offset. Try a date without matches for the empty card. Native map layout, animation and retained scroll still require device verification; unit tests cover grouping, page boundaries and map bounds.

## Persistence and privacy

`users/{uid}/commutes/primary` has optional `startPoint: {latitude, longitude}` and `discoveryEnabled: boolean`, alongside the existing public-presentation `startArea`. Each weekly day optionally stores `startAt` in local minutes after midnight, before the end of the preferred-arrival window (and before any saved return). Absence remains readable for legacy data but produces UNKNOWN / `MISSING_START_TIME` during calendar matching. New onboarding and the morning-time editor require it for inbound days. The schedule step collects arrival/return times; the following morning-time question offers an editable road-based suggestion. A suggestion is applied only after “Use suggested times” is tapped. The entire document remains owner-only. Exact points never enter public profiles.

`users/{uid}/commuteDays/{YYYY-MM-DD}` holds a date-only role exception. Owners can read their exceptions; the emulator-only `setCommuteDay` action performs writes and checks `_rideCommitments` in a transaction. This prevents racing date changes with acceptance. Roles are `drive`, `ride`, `either`, `off`; `default` deletes the override.

`findCommuteMatches` discovers saved, opted-in commutes at the same campus destination, resolves the date, and returns approximate areas, names and proposed timing. It returns no exact points or route geometry. Users cannot read another user's commute or calendar documents.

`findCommuteMatches({ localDate, cursor? })` returns `policyVersion: 2`, `searchRevision`, `totalCandidatePlans`, `checkedCandidatePlans`, `nextCursor`, `incomplete`, and this page’s matches/UNKNOWN/incompatible counts. Pass the returned cursor unchanged for the next page; the client merges and re-sorts checked matches. Scores are absolute arrival differences in seconds, with no weights or fabricated weekly coverage. An older running backend is rejected with a restart instruction rather than silently using the previous hard-deadline policy. The stored field remains named `arriveBy` for compatibility; calendar UI and evaluation interpret it as a preferred arrival.

A calendar request uses existing `createRideRequest` with `source: 'CALENDAR'` and the displayed departure/pickup/arrival times in `proposedPlan`. The rider chooses a particular driver/date. Creation rejects changed road timing rather than silently proposing different times; acceptance also preserves those agreed timing values. `respondToRideRequest` revalidates current accounts, schedule, location, consent and capacity, checks saved input versions, and atomically creates the existing per-user/date commitments. Only one driver/rider pair is supported per inbound date, even if more passenger seats exist.

Only when acceptance succeeds does the transaction create `ridePickups/{requestId}` containing the agreed `driverStart` and `riderPickup`. Rules allow reads only by that accepted ride's participants. Pending/declined requests and unrelated accounts cannot access it. The two clients see it in Rides; Map shows the next accepted partner's point. Future location edits do not change the accepted snapshot.

## Matching without another form

The new path reuses `evaluatePair()`; it does not replace the canonical feasibility evaluator. The old explicit-setup backend API remains for existing requests and regression tests. Its unused mobile form and client helpers have been removed; Home and Map use the saved commute calendar and map instead.

- Uses the chosen date, saved per-day role, morning start time, preferred campus arrival, available passenger seats, private points, and discovery preference.
- Compares driver → campus with driver → rider → campus, with two minutes for boarding. Routing anchors must snap within 75 m.
- Uses the driver’s saved “Leave your starting point at” as a fixed departure. The rider’s “Ready for pickup from” is the earliest pickup; routing determines the proposed pickup and arrival. Saved arrival targets must be within 30 minutes of each other. Actual arrival may be up to 30 minutes earlier or later than each target, on the same date and no later than any saved return time. For Either days, “Ready to head out at” is interpreted according to the evaluated role. Results are potential matches, pending explicit agreement to the proposed timing.
- Does not add a separate matching form, extra pickup windows, walking values or a detour preference. The vehicle pickup/drop-off is the agreed destination for this scoped trip; walking beyond those points is not modeled. One rider requests one seat.
- The evaluator requires finite caps. Calendar proposals use an explicit one-day domain bound, not a claimed user preference. Actual added driving minutes are displayed for the driver's decision.
- Ranks by the absolute difference between the evaluated campus arrival and the searching person’s preferred arrival, then least added driving seconds, then stable driver/rider IDs. Ranking covers the pages checked so far; a later page can contain a better actual arrival. No compatibility percentage. Each match shows the driver’s departure, pickup clock time and minutes from departure to pickup, and campus arrival. These are road estimates without live traffic.
- Missing start times or routing are UNKNOWN, not a false incompatibility. Matching and ride creation/acceptance use PR #13's shared routing gate/cache. No direct mobile routing or pre-acceptance partner geometry is introduced.
- Calendar discovery inspects all opted-in local-demo accounts at the same destination, filtering by the date, role, commitment, seats and ±30-minute saved arrival targets before routing. Each explicitly requested page evaluates at most two driver/rider arrangements (four uncached routes); “Find more matches” checks the next page. The UI keeps a short “More matches may be available” status and a “Find more matches” action until all routing batches are checked. Candidate-plan counts and the long matching explanation are not shown. Either/Either pairs can appear in both roles; each arrangement consumes one evaluation slot. Pages share a revision fingerprint: edited candidates require a fresh search rather than silently skipping people. UNKNOWN routing results remain visible as an unresolved count. This metadata scan is intended for the small emulator demo; production-scale metadata pagination remains future work. Either days can discover drivers and passengers without assigning a role until acceptance.
- Supported dates for edits/searches are today through 30 days ahead; the calendar can display other months. Inbound trips only. Different campus drop-offs are not matched.

## Rides presentation and live updates

Rides follows PR #7’s people-first layout using the real persisted records: a review summary only when a driver has requests to answer, Your carpools grouped by participant identity, This week, collapsed Next week, then clickable History. Review opens one request at a time with trusted Accept/Decline actions. Carpool, trip detail and History routes use the same participant-only stream; no prototype offers, automatic acceptance or synthetic partners are used.

Person cards derive their accepted weekdays, pending asks, next timing and location label on every snapshot. A Monday/Wednesday relationship becomes Wednesday-only after Monday’s agreed arrival. A past accepted trip stops contributing at the later of the vehicle and rider arrival times. With no future/ongoing accepted trips or pending outgoing asks, the person card disappears. Past accepted trips, declined requests and expired pending asks are available in History. A pending request expires in presentation at departure; no frontend writes a completed/expired status or releases backend commitments.

The visible screens refresh on tab focus and app foreground, each minute, and at the next arrival/departure boundary. Accepted timing remains the agreed snapshot; editing the recurring weekly commute does not amend an accepted trip. Future trusted changes to a trip record, or its removal, appear through the live subscription. The active agenda includes saved unmatched commutes and date exceptions, but never invents future accepted occurrences from one dated acceptance. Cancellation, withdrawal and rescheduling actions are still outside this implementation; the old prototype controls are not reintroduced.

The local-demo subscription reads all of the authenticated participant’s requests. An arbitrary document-ID limit could allow old history to hide upcoming rides. Production-scale pagination should split active trips from history; the demo currently keeps this simple and complete. `npm run test:ride-presentation` exercises the actual query with two clients and 150 historical records, live edits/removal, arrival-boundary classification and outsider-read rejection. Unit tests cover the Monday/Wednesday expiry scenario and month/year/DST week boundaries. These tests use isolated emulators and do not verify native screen appearance.

## Road suggestions and vehicle setup

`estimateCommuteStart({ startPoint, campusLot })` accepts the authenticated owner’s draft before onboarding is finished. It makes one direct-road request through the same cross-invocation gate/cache as matching and previews, validates routing anchors, and returns only duration seconds. It is emulator-only. The UI subtracts that duration from each preferred campus arrival and rounds earlier to five minutes; manual edits and provider failures never silently choose a time. This is a direct-trip baseline, not an actual partner pickup time. Traffic and pickup detours are excluded. No new earliest-departure constraint is inferred.

`saveVehicleDetails` is also emulator-only, authenticated, and rejects forged owners or a `verified` field. It stores `users/{uid}/vehicles/primary` with type, color, JPEG thumbnail, plate, registration region and update time. The thumbnail is resized to at most 800 px on its long edge and capped at 350,000 base64 characters. Keeping this small record in Firestore makes demo export/import self-contained without a Storage service or billing. This is a demonstration storage choice, not a production image-upload architecture. Photo and plate remain owner-only, including after ride acceptance; client writes are denied. No public profile or recommendation contains them.

A driver can receive pending rider requests without a vehicle record and can decline them. Acceptance checks vehicle completion before routing, then reads it again inside the seat/commitment transaction. Deleting or changing the record concurrently cannot bypass the requirement. An existing accepted trip is not invalidated by later vehicle edits. Both profiles are gated only when acting as a driver. The UI presents “Finish setting up your vehicle” before the driver proceeds, and requires another deliberate acceptance after setup.

The connection protocol remains rider-initiated: rider requests → driver accepts/declines. Driver search results link to reviewing requests; they do not pretend to send a driver invitation. Vehicle verification, driver-initiated invitations, and sharing vehicle identity with accepted partners remain future work.

## Try it locally

Stop the old backend and Expo first, with one Ctrl-C and completed export. Do not kill workers or delete demo data. See `local-m3-demo.md` for Java/LAN/export setup. This checkout has separate data: preserve the old checkout's export; copy it only into an empty destination after stopping its workers, never overwrite an existing export.

From this checkout:

```bash
npm ci --prefix functions
npm run build --prefix functions
node scripts/start-local-demo.mjs --live-osrm
```

In a second terminal:

```bash
cd mobile
npm ci
node scripts/start-local-demo.mjs "$(ipconfig getifaddr en0)"
```

1. On both clients save a commute with the same campus drop-off and a preferred arrival of 09:00 on a future Monday (for example October 26, 2026). Set the driver’s departure and rider ready-from time to a value that places the actual road-based arrival between 08:30 and 09:30 (for the automated 37-minute shared route, use 08:00 for both). Use precise nearby public station points for a controlled demo. Driver offers at least one seat. Enable matching on review. After selecting the schedule, use or adjust the morning-time suggestion. On the driver, try “Do this later” at the vehicle invitation, then finish it from Account → Your vehicle or the warning sheet before accepting a request.
2. Home shows the recurring week and a “Calendar View” button. Open the sheet, choose the future Monday, select a role and tap “Save this date.” Select “Use weekly default” and save to reset it; verify the following Monday is unaffected. “View this day” returns to Home with that date selected. Close without saving to check that tentative edits are discarded.
3. Rider finds drivers and reviews departure, pickup (including minutes to pickup), campus arrival and added driving time. Use “Find more matches” to check remaining candidates, then request a trip. Driver can independently find passengers and review incoming requests in Rides. Without vehicle details, selecting the driver connection action or accepting shows the completion sheet; declining remains available. Add type/color, choose a car photo, and enter a demo plate/region. This records details and does not mark the driver as verified.
4. Before acceptance neither participant can see the other's exact point. The driver reviews the proposed times and accepts or declines. Acceptance shows the shared ride on both clients and releases pickup details. Date edits for that accepted trip are disabled.
5. Stop gracefully, wait for export, restart and confirm accounts, morning times, date exceptions, private vehicle/photo details and accepted ride/pickup details persist.

Automated tests use only a loopback fake router and temporary emulator exports. No device verification or new live OSRM test is implied by automated results.
