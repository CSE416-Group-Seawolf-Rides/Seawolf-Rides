# Requests and cancellation for the local matching demo

This extends PR #16's saved-calendar matching flow. Firebase stays on the `demo-seawolf-rides` Auth, Firestore and Functions emulators. There is no cloud deployment, paid resource, new dependency, automatic acceptance, Undo notification or timer. Accepted-ride cancellation is outside this change.

## What both roles see

Drivers and riders follow the same workflow. A matched person's card has **Request to carpool** and **View more**. Request to carpool opens the existing detail panel so the date, driving/riding arrangement, departure, pickup and arrival can be reviewed before **Send request**. An Either user chooses the arrangement there. Closing details preserves the match list's position.

Once sent, both clients read the shared pending record. The sender sees **Pending / Cancel request** on the match card and details. The recipient sees **Waiting for your answer / Review request**, and the request appears in Home's Needs you and the Rides review queue. Only the recipient can accept/decline; a driver can receive a rider's request, or a rider can receive a driver's request. The driver needs completed vehicle information when initiating as a driver and again at acceptance. A rider accepting a driver's proposal does not need their own vehicle.

Rides shows outgoing pending dates in the person's carpool card, each with **Cancel request**. The same action is available on that person's dated trip cards and trip details. Cancellation immediately persists `CANCELLED`; both listeners remove incoming decisions, upcoming pending cards and pending calendar indicators. The closed request appears in History. Pending requests reserve no seats, so cancellation does not change commitments or routing quotas.

The sender may search again and send a fresh proposal after cancellation. Declined requests remain final in this MVP. If a schedule or traffic change invalidates a pending plan, the sender can cancel, search for the updated match and send a new proposal; it is never silently accepted with changed times. Accepted trips keep their agreed snapshot and cannot be cancelled with the pending-request action.

## Trusted actions and compatibility

`createRideRequest` accepts both participant IDs for current clients, the selected dated calendar plan/revisions, and a client-generated `attemptId`. The authenticated caller must be one participant; `initiatorId` is derived on the server, and the recipient is the other participant. The canonical evaluator, current eligibility/discovery, seats, departure and commitments are checked as before. Existing rider-only callers/records retain the rider as initiator when those additive fields are absent.

Only one active proposal can exist for a pair/date, including requests sent at the same time and Either role reversals. The transaction reads both ordered pair document IDs before creating a request. An existing pending request is returned for review, not automatically accepted.

`cancelRideRequest({ requestId, attemptId })` permits only the sender to cancel a pending proposal. `respondToRideRequest({ requestId, attemptId, decision })` permits only the recipient. Both require the proposal identifier to match the persisted attempt. Cancelling and resending may reuse the pair/date record with a new attempt; delayed cancellation, acceptance, decline or duplicate creation of the old attempt cannot alter or resurrect the new proposal. Legacy records without an attempt can still be acted on; their first modern resend gains one. A private `_rideRequestAttempts` ledger remembers handled send operations, including losing crossed sends that returned an existing proposal, so delayed send retries cannot reopen a request after subsequent cancellations. This ledger is server-only and included in emulator export/import.

Cancellation, decline and acceptance compete on the same Firestore document transaction. If cancellation wins, acceptance cannot reserve seats. If acceptance wins, cancellation reports that the ride is already confirmed and leaves its two participant commitments and private pickup intact. Cancellation never calls a routing provider, clears a routing owner, or automatically takes over an abandoned scheduler. It remains available while another client's routing operation is busy.

Firestore rules are unchanged: participant-constrained reads only, no direct client request/reservation writes, and exact pickup reads only for accepted participants. No persisted commute schema changes are introduced. Requests and attempts persist through the launcher's normal export/import; stop the backend with one Ctrl-C and wait for export completion.

## Two-client walkthrough

Use the existing verified driver and rider accounts on the same local backend, with matching enabled and a compatible inbound date such as **Monday October 26, 2026**. Both select the same campus destination. Confirm the match's evaluated pickup/arrival against the saved readiness and preferred arrivals before sending.

1. Driver: Home → choose the date → Find passengers → Request to carpool → review the plan → Send request. Complete the existing vehicle setup if prompted, then return and search again.
2. Rider: open Rides. The incoming request and Needs you count should appear. Review it, but do not accept yet.
3. Driver: Cancel request directly on the matched passenger card or in Rides. The rider's incoming actions should disappear; History shows Cancelled on both clients.
4. Driver: search again, review the current estimate and send a new request. Rider: Review → Accept request. The rider needs no vehicle information of their own. Both clients should show the confirmed ride, and only those participants can see the confirmed pickup.
5. Use another future inbound date to reverse who sends: rider finds the driver and requests, then either cancels from the card/Rides or lets the driver accept/decline. The statuses and controls are the same in either direction.
6. Stop both clients' actions, gracefully stop/export the backend, and restart with `--traffic-eta`. Reload/sign in on both clients and verify the shared statuses and confirmed ride remain.

The automated suite uses actual emulator accounts and persisted documents with a local fake TomTom router. It verifies both initiators, both-client status streams, participant authorization, vehicle checks, cancellation/resend, stale/missing attempt rejection, crossed/reversed requests, acceptance/cancellation races, reservations/private reads and restart persistence. This is separate from the previously recorded one-request live TomTom backend check. Physical iPhone/simulator UI behavior and this complete live two-client walkthrough remain unverified.


## Calendar and confirmed trip maps

Map's **Open my calendar** opens the existing calendar sheet over the Map tab. Closing stays on Map; **View this day** selects that date on Map. Calendar overrides still use the same persisted dates and backend actions as Home.

**Rides → Your carpools → person** shows upcoming dated itineraries. Confirmed trips show the precise pickup pin shared at acceptance. **View trip details → Show road route** loads driver start → rider pickup → campus through the authenticated `previewAcceptedRide({requestId})` callable. Only the accepted trip's participants can use it; it accepts no caller coordinates. New accepted private pickup snapshots include campus; older snapshots fall back to the fixed campus catalog using the saved campus label. Missing historical private points are shown as unavailable, not invented.

The preview uses the shared scheduler/cache and configured OSRM or TomTom adapter (one three-point request, no automatic retry/polling). Busy/provider errors leave the confirmed ride untouched. A future trip uses its agreed departure; a past departure uses current time plus one minute. This road preview does not reschedule the trip or add boarding/waiting time. It is not live navigation. Exact pins do not imply a verified street address: existing saved commutes retain coordinates and approximate area labels, not a verified house number/address.

**Directions to pickup in Maps** hands that exact pickup to the phone's Maps app (Apple Maps on iOS, Google Maps URL elsewhere), where navigation can be started. Maps calculates its own route/ETA from the user's current location; it does not import the carpool schedule or automatically continue through campus. Full in-app GPS, rerouting, tracking, and background navigation remain deferred.

Manual check: open calendar from Map, select/save a date, close without changing tabs; accept a real two-account trip; driver opens the person's carpool to see the exact pickup pin, then trip details to load the road route. Repeat as rider, and try Maps directions. Device layout, map gestures, and external navigation handoff require a physical-device check.
