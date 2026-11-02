# Drop-off preferences and buffered arrival proposals

This extends the emulator-only M3 flow. No cloud deployment, paid resources, new provider, or routing bypass is introduced.

## Choices and actual destination

Onboarding and **Account → Edit commute** offer a rider **Any** alongside the existing campus stops. A rider with Any sets pickup readiness manually until a match supplies a real destination; onboarding does not invent a campus routing anchor. A Both user keeps a concrete parking choice for driving days and can independently select Any for riding. With Any, Both's driving days still receive direct-trip departure forecasts; riding/either days require manual readiness until matching. Existing users without the optional preference retain their saved campus preference.

The current trip still has **one shared campus stop: the driver's parking destination**. A rider's different preferred stop does not remove that driver from discovery or make the pair incompatible by itself. Each match explicitly displays actual drop-off and, when different, the preferred stop. For example: **Drop-off · West Side · Preferred: Lot 40**. This does not claim arrival at Lot 40, add a walk to Lot 40, or promise a second campus stop. The proposed actual stop and times are what participants review before sending/accepting.

Discovery queries all opted-in commutes, rather than filtering by exact campus equality. It retains dated roles, capacity/commitments, precise private anchors and intersecting ±45-minute preferred-arrival windows. Routing remains bounded per page; candidate counts and incomplete-search disclosure remain visible.

Ranking balances the searching commuter’s schedule shift (weighted twice), the other
commuter’s shift, added driving and the rider’s extra travel. Preferred drop-off
breaks equal-cost ties, followed by timing, driving and stable identities. UNKNOWN
routing remains unavailable rather than receiving a recommendation rank.

## Arrival and departure

Saved times are preferences with **45 minutes early or late** allowed for each
person. A 9:00 AM preference permits 8:15–9:45 AM. Proposals use the intersection
of both windows and aim three minutes before their midpoint. This preserves the
8:57 AM default when both prefer 9:00 AM. Readiness, the local date and saved return
still constrain the proposal. Actual stop, early/late shift and proposed times are
shown before requesting. See [flexible matching](flexible-matching.md).

Saved driver departure remains a reference for review. Matching does not rewrite
weekly schedules or already accepted ride records. Pending requests whose
revalidated trip times changed require a fresh search and review.

Traffic estimates use at most four protected requests per candidate:

1. Arrival-based driver → pickup → actual campus seed, targeting arrival three minutes early minus the 120 seconds reserved for boarding. Its leg duration also provides an initial departure bound respecting rider readiness.
2. Driver → campus baseline at the proposed departure.
3. Driver → pickup at that same proposed departure.
4. Pickup → campus at actual evaluated pickup driving completion plus boarding.

The canonical evaluator checks the final three timed estimates at the actual proposed departure. The seed is planning evidence, not the displayed final arrival or a separate feasibility evaluator. No iterative probing or automatic retries are added. If the bounded forecast cannot validate a timely proposal, no late plan is recommended. Static OSRM still needs two provider requests per candidate; the canonical evaluator chooses a departure within the valid intersection using those supplied durations. The existing shared cache, cross-invocation guard, 1.1-second spacing, four-request/55-second budget and timeout/recovery rules remain unchanged.

Onboarding TomTom suggestions request the direct trip arriving three minutes before the saved preference. Suggestions round down to the minute, rather than five minutes, so rounding does not accidentally make arrival more than five minutes early. These are estimated direct-trip times; partner pickup proposals are calculated during matching. Estimates do not guarantee observed road arrival.

## Persistence, privacy and verification

The additive owner-only `riderDropoffPreference: 'any'` field is optional; omission uses the saved campus choice. It does not replace a Both driver's parking destination or modify accepted records. New accepted snapshots use the **actual driver's campus**, including when the rider selected Any or a different preference, so Rides, route preview and Map remain consistent. Restart local emulators after pulling to load the new rules/functions; export/import preserves the preference and actual accepted destination.

Regression coverage includes Any/parking round-trips and rules, alternate-stop discovery/ranking, unchanged saved departure, earlier proposed departure, readiness/boarding, exact 8:55/9:00 boundaries, late/irreconcilable arrivals, fractional-duration rounding, dated traffic seeds and final legs, UNKNOWN failures, real-account requests/acceptance, actual stop sharing and restart persistence. Tests use a local fake router. Device onboarding/keyboard/sheets and a live two-device provider run remain manual checks.
