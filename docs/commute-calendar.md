# Saved week, dated calendar, and private pickup points

This branch builds on merged PRs #12–#14. It keeps the demo on `demo-seawolf-rides` using Auth, Firestore and Functions emulators, with no cloud deployment or billing changes. Trip-time amendments, chat, recurring reservations and cancellation remain deferred.

## Product behavior

- Home is a calendar with a saved-week summary, date-specific role controls and real-account recommendations. Map is a native map again, showing the owner's private starting point, the approximate area others see, the campus destination and the next accepted partner's point.
- Driver-only and rider-only roles fill their selected weekly commute days. For a `both` profile, each weekday keeps its saved Driving / Riding / Either choice. Unselected days are off.
- A date exception changes only that date. “Use weekly default” removes the exception. An added date uses the first saved day's arrival/return times, shown before editing. Weekly edits affect future defaults; explicit date exceptions remain explicit.
- Existing accepted rides retain their agreed role, timing and pickup snapshot. Calendar changes on an accepted date are rejected atomically. Editing the weekly template does not reschedule an accepted ride.
- Exact locations selected during setup are now retained privately. Setup shows the owner's exact pin for confirmation and a separate two-mile circle with an explanation of what other users see. A public meeting point can be selected instead of a home address.
- Legacy approximate-only commutes still load; users reconfirm their location and save the commute before using the new matching path. Nothing guesses an exact point from the old circle.
- Review includes a saved discovery switch and explains that the schedule is reused until changed, and accepted partners receive the exact pickup points. The routing provider receives exact coordinates to compute road estimates, before participant acceptance.

## Persistence and privacy

`users/{uid}/commutes/primary` has optional `startPoint: {latitude, longitude}` and `discoveryEnabled: boolean`, alongside the existing public-presentation `startArea`. The entire document remains owner-only. Exact points never enter public profiles.

`users/{uid}/commuteDays/{YYYY-MM-DD}` holds a date-only role exception. Owners can read their exceptions; the emulator-only `setCommuteDay` action performs writes and checks `_rideCommitments` in a transaction. This prevents racing date changes with acceptance. Roles are `drive`, `ride`, `either`, `off`; `default` deletes the override.

`findCommuteMatches` discovers saved, opted-in commutes at the same campus destination, resolves the date, and returns approximate areas, names and proposed timing. It returns no exact points or route geometry. Users cannot read another user's commute or calendar documents.

A calendar request uses existing `createRideRequest` with `source: 'CALENDAR'` and the displayed departure/pickup/arrival times in `proposedPlan`. The rider chooses a particular driver/date. Creation rejects changed road timing rather than silently proposing different times; acceptance also preserves those agreed timing values. `respondToRideRequest` revalidates current accounts, schedule, location, consent and capacity, checks saved input versions, and atomically creates the existing per-user/date commitments. Only one driver/rider pair is supported per inbound date, even if more passenger seats exist.

Only when acceptance succeeds does the transaction create `ridePickups/{requestId}` containing the agreed `driverStart` and `riderPickup`. Rules allow reads only by that accepted ride's participants. Pending/declined requests and unrelated accounts cannot access it. The two clients see it in Rides; Map shows the next accepted partner's point. Future location edits do not change the accepted snapshot.

## Matching without another form

The new path reuses `evaluatePair()`; it does not replace the canonical feasibility evaluator. The old explicit-setup API remains for existing requests and regression tests, but Home and Map no longer render its technical form.

- Uses the chosen date, saved per-day role, campus arrival deadline, available passenger seats, private points, and discovery preference.
- Compares driver → campus with driver → rider → campus, with two minutes for boarding. Routing anchors must snap within 75 m.
- Suggests the latest feasible departure that meets both campus arrival deadlines. The date boundary and current time bound the calculation; they are **not** assertions that someone is ready that early. Results are potential matches, pending explicit agreement to the proposed timing.
- Does not ask for earliest departure, pickup windows, walking values or a detour preference. The vehicle pickup/drop-off is the agreed destination for this scoped trip; walking beyond those points is not modeled. One rider requests one seat.
- The evaluator requires finite caps. Calendar proposals use an explicit one-day domain bound, not a claimed user preference. Actual added driving minutes are displayed for the driver's decision.
- Ranks by least added driving seconds, then stable driver/rider IDs. No compatibility percentage.
- Missing routing is UNKNOWN, not a false incompatibility. Matching and ride creation/acceptance use PR #13's shared routing gate/cache. No direct mobile routing or pre-acceptance partner geometry is introduced.
- Public-demo discovery remains bounded to two candidate accounts and two proposed driver/rider arrangements (four uncached routes). Either/Either pairs can appear in both roles; each arrangement consumes one evaluation slot. Skipped accounts or arrangements are labeled as incomplete discovery. Either days can discover drivers and passengers without assigning a role until acceptance.
- Supported dates for edits/searches are today through 30 days ahead; the calendar can display other months. Inbound trips only. Different campus drop-offs are not matched.

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

1. On both clients save a commute with the same campus drop-off and an arrival deadline of 09:00 on a future Monday. Use precise nearby public station points for a controlled demo. Driver offers at least one seat. Enable matching on review.
2. Home shows the recurring week and a calendar. Choose the future Monday, change its role, then use weekly default; verify the following Monday is unaffected.
3. Rider finds drivers, reviews the proposed pickup/arrival/added driving time and requests the trip. Driver can independently find passengers and review incoming requests in Rides.
4. Before acceptance neither participant can see the other's exact point. The driver reviews the proposed times and accepts or declines. Acceptance shows the shared ride on both clients and releases pickup details. Date edits for that accepted trip are disabled.
5. Stop gracefully, wait for export, restart and confirm accounts, date exceptions and accepted ride/pickup details persist.

Automated tests use only a loopback fake router and temporary emulator exports. No device verification or new live OSRM test is implied by automated results.
