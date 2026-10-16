# Seawolf Rides: three drivers, seven riders

Implementation specification and sequential Codex prompts. Prepared October 16, 2026, from the supplied `test.zip`.

Reviewed snapshot SHA-256: `93e547cf9f0961959afcfa8a6f8a14cd3eaf347499c4752e0f0261ca08bf8816`. The developer should reconcile subsequent checkout changes rather than assuming this snapshot is still the exact current tree.

## 1. Decision and scope

Build a development-only, many-user recommendation demonstration inside the existing **Carpool Matching Demo** entry. It will show three synthetic cars and seven synthetic rider intents for one dated TO_CAMPUS occurrence. Users select a car, compare recommendations, preview a complete proposed route, and explicitly simulate accepting a request. Every accepted addition must preserve a feasible plan for that car's entire passenger group.

This is **ranked recommendations with manual test acceptance**, not automatic fleet assignment. Loading data does not assign passengers or reserve seats. A rider may be recommended to several cars but may belong to only one accepted car for that occurrence. No maximum-service or globally optimal assignment claim is made.

Preserve the normal app, the existing Friday workflow, profiles, chat UI, standalone routing, and navigation providers. No backend, messaging, real authentication, photo upload, background navigation, provider migration, or dependency upgrade is required here. The simulated actors are not the signed-in user's real identity or commute. Precise synthetic points are deliberately visible; this is not a real-user location-sharing authorization boundary.

Use the existing entry: **Map → Carpool Matching Demo → Three cars / seven riders**. Retain the two existing one-driver presentation cases. Keep the Friday loader under Developer tools. Do not add another competing top-level demo button.

## 2. What the current code actually supports

The archive has 199 files. Compared with the previously reviewed snapshot, 148 supplied files are unchanged, 35 changed, and 16 are newly supplied. The new content includes assets, dated proposals/transitions, Friday testing, and public profiles. These are observed source changes, not just implementation-report claims.

| Area | Present implementation | Reuse or required change |
|---|---|---|
| Pair evaluator | `src/matching/evaluatePair.ts`; one driver/one rider, TO_CAMPUS, static directed estimates, explicit windows and limits | Preserve. It is not a complete multi-rider solver. Its no-wait result is not a safe blanket rejection filter for a new solver that permits waiting. |
| Normal recommendations | `driverRecommendations.ts`; live routing, individual pair ranking, dated proposal builder | Reuse input/proposal conventions and routing boundaries; extend with a group-aware layer rather than looping only over empty-car evaluations. |
| Dated contract | `src/rides/datedRideProposal.ts`; V1 agreement versus routing estimates, 30-minute freshness, revision fingerprint | Preserve V1 compatibility. Add a separate combined-plan record; a per-pair plan is not proof of a shared group route. |
| Acceptance | `requestTransitions.ts`, `RidesProvider.tsx`; synchronous status/capacity/commitment/freshness checks | Combined route evaluation and asynchronous stale-result protection are missing. |
| Friday data | `fridayDriverTest.ts`; Ava 1 seat, Ben 2, Chloe 1, Jamaica → Tabler | Keep unchanged as a user-facing scenario. Adapt it to shared group validation where complete data exists. |
| Trip identity | `rideModel.ts`; `Trip.id` is the local date, one current-user trip per day | Do not treat this date-only model as a multi-car store. Add explicit occurrence identity and adapters. |
| Pickup routing | `tripPickupRoute.ts`; compares bounded permutations by driving duration, then separately checks the selected schedule | Select among fully feasible plans first. Preserve explicit agreed-order restrictions. |
| Map | `MapScreen.tsx`, `routing/components/RouteMap.tsx`; road layers, pickup markers, full screen | Reuse rendering and expansion. The current comparison component is one driver plus alternative riders, so add a small reusable multi-car layer/component. |
| Profiles | `PublicProfile`, stable IDs, avatars, `/profile/[participantId]` | Register ten stable synthetic participant identities; reuse existing modal access. |
| Local data | Normal `RidesProvider` represents the current user's incoming/outgoing requests | Introduce an isolated scenario store for the ten synthetic actors. Share evaluation and transition services; do not duplicate their business rules. |

### Verified checks on this upload

- Node 24.21.0: **168/168 tests passed** with the supplied test loader.
- TypeScript: passed with an external review config matching the earlier strict Expo config. `tsconfig.json` was not supplied in this ZIP.
- Lint: passed using the earlier supplied Expo ESLint config against current source, plugins, tests, and `app.config.js`. The current ZIP omits `eslint.config.js`.
- Android JavaScript/Hermes export: passed, 1,615 modules bundled. This does not establish native compilation or device navigation.
- The manifest and lockfile are byte-identical to the earlier verified dependency installation; that installation was reused in the isolated review copy.
- No supplied source file was modified. No Git metadata is present, so branch, commit, and working-tree status are unknown. No device/emulator or fresh live-routing run was used for this review.

### Additional reproducible probes

1. **Individually feasible is not jointly feasible.** Two resealed, individually FEASIBLE dated proposals were accepted by `transitionIncomingRequest`. Ava's ready window was 08:10–08:12 and Ben's 08:20–08:21. With the supplied deterministic legs and two-minute service, Ava-first reached Ben too late; Ben-first reached Ava too late. Both acceptances nevertheless returned ACCEPTED.
2. **Shortest road order can hide a valid order.** The current planner returned a 30-minute A→B order with a schedule conflict even though a 35-minute B→A order passed the current schedule checker.
3. **The state is not a global three-driver store.** When deliberately given requests for two drivers, the incoming transition counted another car's accepted seat against the second driver's capacity. `getUpcoming` also combined the two drivers' riders into one date-keyed trip. These APIs were built for a current-user view; adding a second driver array is insufficient.
4. **Some prior findings were fixed.** Skipped selected trips are now rejected by `resolveTripPickupSelection`; proposal-derived rider deadlines subtract egress walking; dated proposal data reaches accepted trips; request seat quantities are counted. Do not reimplement these fixes blindly.

All new probes used deterministic adapters outside the application. They did not change the supplied test suite or app source.

## 3. Scenario specification

Default occurrence: **Monday, October 19, 2026**, TO_CAMPUS, America/New_York. Keep the date explicit and permit choosing another date by resetting and regenerating this isolated scenario. Use the real current clock for proposal creation/expiry; do not hardcode a stale proposal timestamp. Keep scheduling time and proposal-freshness time distinct.

All cars share the confirmed **Tabler** vehicle drop-off. All riders explicitly accept that drop-off and have a five-minute egress assumption. These are synthetic assumptions, not walking routes measured by OSRM.

### Drivers

| Driver | Start | Passenger seats | Departure window | Preferred departure | Vehicle campus arrival | Absolute detour | Ratio cap |
|---|---|---:|---|---|---|---:|---:|
| Jordan | Jamaica LIRR | 3 | 07:55–08:05 | 08:00 | 08:30–09:00 | 15 min | 50% |
| Morgan | Mineola LIRR | 3 | 08:00–08:20 | 08:10 | 08:30–09:00 | 15 min | 50% |
| Taylor | Ronkonkoma LIRR | 2 | 08:10–08:30 | 08:20 | 08:30–09:00 | 10 min | 50% |

Capacities are passenger seats; the driver does not consume one. All three use distinct participant and offer IDs even where a starting coordinate equals a rider pickup.

### Riders

| Rider | Public pickup | Seats | Pickup-service start window | Arrival at actual destination | Purpose |
|---|---|---:|---|---|---|
| Ava | Mineola LIRR | 1 | 08:10–08:12 | 08:30–09:00 | Tight early window; fits alone, conflicts with Ben in the same car |
| Ben | Hicksville LIRR | 2 | 08:20–08:21 | 08:30–09:00 | Tight later window; two-seat party, one pickup |
| Chloe | Stony Brook LIRR | 1 | 08:00–08:55 | 08:30–09:00 | Valid shared-route addition; too much relative detour for Taylor |
| Diego | Ronkonkoma LIRR | 1 | 08:00–08:45 | 08:30–09:00 | Feasible for all three; demonstrates competing recommendations |
| Emi | Hicksville LIRR | 1 | 09:10–09:20 | 08:30–09:00 | Ready after the arrival deadline; timing failure |
| Finn | Port Jefferson LIRR | 1 | 08:00–08:55 | 08:30–09:00 | Detour failure |
| Grace | Ronkonkoma area, exact point unconfirmed | 1 | 08:00–08:55 | 08:30–09:00 | UNKNOWN; approximate area must not enter exact routing |

Every rider: access walk 5 min, maximum 10 min; egress walk 5 min, maximum 10 min; maximum extra in-vehicle time 15 min. Pickup service is **120 seconds per request stop**, including Ben's two-seat party; it is not multiplied by seats or applied again in provider travel durations. All pickup windows mean the rider is already ready at the selected point; do not add access walking a second time.

Use a `demo3x7` namespace. Example distinct IDs: participant `demo3x7-person-ava`, rider intent `demo3x7-intent-ava-2026-10-19`, and per-car request `demo3x7-request-jordan-ava-2026-10-19`. Stable identities survive reset/reload, but every load generation and every fresh proposal has a separate revision/freshness context. These are separate fictional records from the Friday fixtures even where first names coincide.

Loading creates **3 offers and 7 available rider intents**, not 21 accepted/pending requests. Evaluations create up to 21 candidate edges. Only an explicit test-request action materializes a driver-specific pending proposal; explicit acceptance changes membership. A single clearly labeled demo action may simulate both steps through the shared request/acceptance service, but the load action must not.

### Coordinate references already present in the code

| Node | Meaning | Latitude | Longitude |
|---|---|---:|---:|
| Q | Jamaica | 40.69960817 | -73.80852987 |
| M | Mineola | 40.74034743 | -73.64086293 |
| H | Hicksville | 40.76717491 | -73.52853322 |
| R | Ronkonkoma | 40.80808613 | -73.10594023 |
| S | Stony Brook station | 40.92032252 | -73.12854943 |
| P | Port Jefferson | 40.93455310 | -73.05250164 |
| C | Tabler | 40.9097068 | -73.1269548 |

The station references are sourced in the uploaded fixtures to the MTA GTFS feed; Tabler comes from `campusDestinations.ts`. Reuse these test anchors without claiming GTFS stop centers verify a particular curbside entrance. Grace may have a clearly approximate area marker for the synthetic display, but no selected routing point.

## 4. Deterministic fixture travel model

Fixture mode is the default presentation mode. These deliberately simplified durations are **not real road ETAs**. Geometry is schematic and must retain the visible label **“Schematic — not a road route.”** Do not display a real-road geometry layer next to fixture-derived matching metrics as if they came from the same calculation.

Use the following directed minutes; multiply by 60 for the domain API. The matrix is the shortest-path closure of a small synthetic directed graph. Reverse travel is intentionally different. Zero diagonals describe identical coordinates only.

| From / to | Q | M | H | R | S | P | C |
|---|---:|---:|---:|---:|---:|---:|---:|
| Q | 0 | 10 | 20 | 30 | 38 | 55 | 40 |
| M | 14 | 0 | 10 | 20 | 28 | 45 | 30 |
| H | 28 | 14 | 0 | 10 | 18 | 35 | 20 |
| R | 42 | 28 | 14 | 0 | 8 | 25 | 10 |
| S | 52 | 38 | 24 | 10 | 0 | 22 | 7 |
| P | 73 | 59 | 45 | 31 | 26 | 0 | 17 |
| C | 56 | 42 | 28 | 14 | 9 | 15 | 0 |

If distance is needed for this fixture, use `durationMinutes × 600` meters and label it synthetic. It is not derived from marker spacing. No matrix estimate is available for Grace.

Solo durations: Jordan 40 min, Morgan 30 min, Taylor 10 min. Active detour limits are respectively **15, 15, and 5 min** after taking the stricter absolute/ratio limit.

### Required initial outcomes

| Rider | Jordan, empty car | Morgan, empty car | Taylor, empty car |
|---|---|---|---|
| Ava | FEASIBLE | FEASIBLE | INFEASIBLE |
| Ben | FEASIBLE | FEASIBLE | INFEASIBLE |
| Chloe | FEASIBLE | FEASIBLE | INFEASIBLE: detour |
| Diego | FEASIBLE | FEASIBLE | FEASIBLE |
| Emi | INFEASIBLE: timing | INFEASIBLE: timing | INFEASIBLE: timing |
| Finn | INFEASIBLE: detour | INFEASIBLE: detour | INFEASIBLE: detour |
| Grace | UNKNOWN | UNKNOWN | UNKNOWN |

This is 9 feasible edges, 9 infeasible edges, and 3 unknown edges—not nine people. The results must be calculated from the data, not hardcoded into cards. The classification table and the group examples below were checked using a separate planning oracle; that is not an implementation of the feature in the app. The temporal-constraint feasibility, interval extraction, and schedule extraction were additionally checked against exhaustive enumeration on 300 small randomized two-pickup instances. This supports the formulation, not the correctness of future TypeScript code.

### Required group examples

- Jordan + Ava + Ben: capacity fits exactly (1 + 2 = 3), but **no pickup order is schedule-feasible**. Ava cannot start before 08:10; after two minutes of service and ten minutes to Hicksville, Ben cannot start before 08:22, later than his 08:21 latest. Ben-first reaches Ava far too late.
- Jordan + Ava + Chloe: FEASIBLE. Choose 08:00 departure, Ava pickup-service start 08:10, boarding complete 08:12, Chloe pickup 08:40, boarding complete 08:42, vehicle campus arrival 08:49, both rider destinations 08:54. Road driving 45 min, service 4 min, waiting 0, elapsed 49 min, total added time 9 min. Adding Chloe after Ava increases elapsed time by 7 min; the cap still applies to the **total 9 min**, not just 7.
- Morgan + Ben + Chloe: FEASIBLE, 3/3 seats. Depart 08:10, Ben pickup 08:20, Chloe pickup 08:40, vehicle campus 08:49, rider destinations 08:54. Elapsed 39 min versus a 30-minute baseline; total added time 9 min.
- Taylor + Diego: FEASIBLE. Depart 08:20, pickup 08:20, boarding complete 08:22, vehicle campus 08:32, rider destination 08:37. Added time 2 min.

Do not require live OSRM to reproduce these outcomes. Live mode uses the same people/constraints and real provider durations; it may produce different results or no feasible matches.

## 5. Shared data contract and state ownership

### Identities

Represent an occurrence using driver participant ID, local date, direction, and timezone, with a stable occurrence ID and offer association. Each driver has one active offer for this demo occurrence. The scenario's namespace/generation is a separate ownership boundary. A date string alone is not a car identifier.

Keep participant, rider-intent, offer, driver-occurrence, request, proposal, and combined-plan IDs distinct. Use participant IDs consistently in proposals and profiles. The current normal builder's fallback `synthetic-driver-${offer.id}` and the profile helper's `demo-driver-*` mapping must be reconciled at the adapter boundary; do not create yet another identity format accidentally.

Use explicit selectors, for example:

```ts
getAcceptedMembers(state, driverOccurrenceId)
getRiderCommitment(state, riderId, localDate, direction, timeZone)
getDriverCapacity(state, driverOccurrenceId)
```

Driver capacity counts only that car. Rider commitment checks cover **all three cars** in the same scenario occurrence. Normal account/Friday state must not be silently imported into this synthetic world or overwritten by it.

### Combined plan

Add a separate typed result such as `GroupRoutePlanV1`, containing at least:

- Occurrence identity, authoritative driver-contract revision, member request/participant IDs, and proposal revisions.
- Confirmed start and common campus drop-off; each confirmed pickup and all original rider promises.
- Selected order and explicit fixed-order restrictions, if any.
- Feasible departure interval for the selected order, chosen departure, physical pickup arrival, service start, boarding completion, planned waiting, vehicle campus arrival, and per-rider destination arrival.
- Road duration/distance, service duration, waiting duration, elapsed duration, solo reference, total added driver duration, incremental added duration, and per-rider in-vehicle detour.
- Routing mode/provider identity, estimate timestamp/revision, geometry validity, and whether search was complete over permitted orders.

Per-pair estimated times may change when a group changes. Preserve the agreed pickup and windows; keep the new group schedule separately, label its times as estimates, and update every affected rider view from the same accepted group plan. Do not overwrite a V1 proposal with another rider's times, silently narrow promised windows, or infer extra stops from an old offer.

Pending proposal expiry is checked at acceptance. Already accepted memberships do **not** disappear after 30 minutes. Their future route may need revalidation, but accepted promises remain until an explicit cancellation or other declared transition.

## 6. Feasibility mathematics

Use integer epoch seconds, seconds for duration, meters for distance. For each permitted pickup order, solve the full fixed-order schedule, then compare feasible orders. A few pickups allow bounded enumeration; do not enumerate every subset when the task is simply adding one candidate to an existing car.

Let `d` be driver departure, `p_i` pickup-service start, `s_i` service duration, `c` vehicle campus arrival, and `t(u,v)` directed road time. Boarding completes at `b_i = p_i + s_i`.

Required constraints:

```text
driverDepartureEarliest ≤ d ≤ driverDepartureLatest
riderPickupEarliest_i ≤ p_i ≤ riderPickupLatest_i
p_1 ≥ d + t(start, pickup_1)
p_(i+1) ≥ p_i + s_i + t(pickup_i, pickup_(i+1))
c = p_last + s_last + t(pickup_last, campus)
driverCampusEarliest ≤ c ≤ driverCampusLatest
riderDestinationEarliest_i ≤ c + egress_i ≤ riderDestinationLatest_i
c - (p_i + s_i) ≤ t(pickup_i, campus) + maxExtraInVehicle_i
c - d ≤ soloDuration + min(absoluteDetour, ratio × soloDuration)
sum(requestedSeats_i) ≤ passengerCapacity
accessWalk_i ≤ maxAccessWalk_i; egressWalk_i ≤ maxEgressWalk_i
```

If the ratio limit is absent, use the absolute cap. For fractional caps with integer-second schedules, compare without rounding upward; an integer upper bound may be floored. Preserve explicit handling of zero baselines with enabled percentage limits, malformed inputs, unsupported direction, and materially inconsistent estimates.

**Waiting policy:** planned waiting is allowed only at the explicit public pickup stops, within pickup windows and driver total-detour limits. It may be necessary to place waiting before boarding rather than after a rider is already onboard. Return the waiting plan. No implicit roadside stops or waiting at campus are introduced. For no riders, `c = d + soloDuration`.

### Recommended small exact solver

For one fixed order, these are difference constraints `x_v - x_u ≤ k`. A small Simple Temporal Network can represent them, with a fixed zero-time reference node. Two constraints encode equality. Negative-cycle detection establishes infeasibility. Shortest-path closure gives departure bounds. This uses no new solver dependency.

Use a pure implementation with explicit finite/integer validation. To minimize elapsed duration for an order, search the integer bound on `c-d` between the known road-plus-service lower bound and the allowed maximum; feasibility is monotone in that bound. At the minimum elapsed duration, select departure closest to the driver's preference from the remaining feasible departure interval, constrain it, and extract a consistent schedule. Apply stable order/ID ties.

Do not rely on greedy earliest pickup alone: it can miss a valid schedule that shifts waiting to before boarding and thereby preserves an onboard rider's ride-time limit. Do not use a minute-sampling grid that misses a one-second feasible interval. An equivalent exact method is acceptable if its guarantees and tests cover these cases. This is a project-specific small static-time solver, not a claim to implement a commercial fleet optimizer.

Keep each order's actual feasible interval; never replace a disconnected union of order intervals with a single envelope that claims the gaps are feasible. Respect fixed agreed orders or precedence constraints. No route may omit an accepted passenger to make a candidate fit.

### Status rules

- FEASIBLE requires one complete valid plan for every accepted member plus the candidate.
- Proven route-independent failures such as excessive seats may return INFEASIBLE immediately.
- An explicitly unreachable directed leg disqualifies orders requiring it.
- Missing/unconfirmed points, missing estimates, malformed provider data, cancellation, or a search limit cannot be converted into a feasible plan.
- If no known feasible order exists and a potentially relevant order remains unresolved, return UNKNOWN. Return INFEASIBLE only when all permitted orders are disproved or an independent hard constraint proves failure.
- If a feasible order exists but unresolved orders might be cheaper, it can be offered as feasible, but do not claim optimality over all orders. Include a search-completeness flag.

### Ranking policy

For one selected car, rank only feasible additions by: (1) least incremental elapsed driver time over that car's current accepted plan; (2) least rider access-plus-egress walking; (3) widest feasible departure interval for the selected order; (4) stable rider ID. Enforce total added elapsed time against the original solo reference regardless of ranking. Record the current-plan reference so changing membership invalidates ranks.

The preferred departure is a preference inside a hard window, not a substitute for testing the window. The proposed policy minimizes elapsed time, then uses departure preference within equal-cost schedules. Display that choice plainly.

## 7. Routing and computation boundaries

Extend the routing layer with a directed-leg estimate source/cache around the existing adapter. Keep `RoutingAdapter.route()` compatible. Optional matrix support is later; separate two-point route calls are sufficient for this small demo if deduplicated and bounded.

For three distinct starts, seven distinct confirmed pickup points, and one common campus point, a conservative full leg set is:

```text
3 start→campus baselines
3×7 start→pickup values
7×6 pickup→pickup values
7 pickup→campus values
= 73 directed values, before pruning/deduplication
```

The actual proposed fixture has only five distinct confirmed pickup coordinates, some shared with driver origins. After exact-coordinate deduplication, its full nonzero needed set is at most **31 directed values**. Grace is never routed. Already co-located points may have an explicit zero leg, but keep separate participant/service events. Never use zero for a missing or unreachable road leg.

Cache per provider/profile/options and exact confirmed endpoints, with timestamps and generation/version ownership. Keep direction in the key. Do not merge merely nearby points. Share in-flight identical work. Bound network concurrency globally for a scenario evaluation—proposed default 3, not 3 per car nested inside 3 more workers. That default is a design choice to measure, not a provider capacity guarantee.

Fetch selected/accepted route geometry after numerical planning, not once for each permutation. Validate the returned ordered legs and pickup snap distances (reuse the current 75 m threshold). If ordered-route estimates differ from cached leg estimates, revalidate and update the plan or return a retry/incomplete result; do not keep a stale verified badge. A snapshot of straight lines is never live-road proof.

Cancellation/reset/mode changes invalidate one root generation; late success and late failure must not restore old results or overwrite a newer loading state. A selection-only change should not unnecessarily reset the entire world. Retry failed work without silently switching providers or using fixture values.

Track directed-leg requests, cache hits, geometry requests, orders evaluated, evaluation time, provider time, stale responses, and status counts under collapsed diagnostics. Measure rather than promise latency. Only tiny live smoke tests are needed; large synthetic load tests use fixtures.

## 8. Acceptance protocol

Use one shared local service for combined-route acceptance, called from the demo and the fully specified normal dated-driver/Friday flow through adapters.

1. Snapshot the exact driver occurrence, current memberships, candidate request/proposal, rider commitments across cars, and state/input revisions.
2. Check identity, pending status, proposal expiry, skip/cancellation, capacity, and immutable agreement compatibility.
3. Evaluate the whole candidate group outside the state mutation using current or explicitly fresh routing estimates.
4. Commit through one synchronous reducer/transition only if all relevant revisions and freshness still match. Write the accepted membership and combined plan together.
5. If state changed, recompute against the new snapshot within a bounded retry policy or return STALE/RETRY. Never apply an old result to new state. Guard reset/reload generations even when participant/request IDs are stable.

Do not hold an assumed database lock across routing calls. The local revision check is not cross-device atomicity or backend authorization. Do not use the proposal fingerprint as a security signature.

Rejected operations preserve the existing state and accepted plan. Pending requests consume no seats. Cancellation releases only the exact membership and invalidates/recomputes that car's derived plan; it does not silently reassign anyone. Expired pending proposals may be explicitly refreshed/recreated, while accepted riders remain committed.

Legacy requests without full promises retain their explicit legacy classification. Do not fabricate limits or present a partial check as full group verification. Unknown required facts block new fully verified additions through the new path until provided. Keep legacy display and regression coverage intact.

## 9. Implementation stages and exit gates

Execute one prompt at a time. Review the resulting report and required checks before the next prompt. Each prompt assumes the developer has this specification available and inspects the actual current checkout.

| Stage | Deliverable | Exit gate |
|---|---|---|
| 0 — completed in this review | Current source audit, probes, scenario and contract specification | Findings above; no feature code changed |
| 1 | Domain adapters, occurrence identities, seven-rider/three-driver factories, fixture matrix | Counts/IDs/units/coordinate accuracy and all fixture data verified; no new UI |
| 2 | Pure complete-group scheduling and order selection | Exact timing, waiting, detour, capacity, unknowns and alternative-order regressions pass |
| 3 | Shared directed travel orchestration and live route validation | Request budget, deduplication, concurrency, cancellation and geometry consistency proven |
| 4 | Reusable group-aware recommendations | Initial 21-edge outcome table and membership-dependent ranks computed correctly |
| 5 | Atomic local group acceptance and cancellation | Last-seat and cross-car commitment races, stale/reset results, and Friday compatibility pass |
| 6 | Existing-demo integration and map presentation | Ten profiles, three cars/seven riders, scoped selection, accepted/proposed routes, full screen |
| 7 | Phone QA, presentation script, regression check and cleanup | End-to-end scenarios pass; remaining limits documented; no production/demo leakage |

### Common instructions for every Codex prompt

Read `AGENTS.md` and the actual current source. Use the repository's pinned Node 24.21.0. Preserve unrelated working-tree changes and keep the task on the current branch. Do not commit, push, merge, switch branches, upgrade dependencies, or implement unrelated features. Follow the versioned Expo 57 documentation when touching Expo/React Native APIs. Reuse the existing Node test runner/resolver; do not introduce Jest or a second test framework.

Run typecheck, lint, and appropriate meaningful tests after each stage. Run the full suite at integration boundaries and Android export when UI/routing integration changes. Do not claim device, native, live-provider, or performance checks unless actually performed. If configuration/assets are missing in that checkout, report the exact limitation rather than creating fake assets or silently changing configuration to pass.

## 10. Copy-paste Codex prompts

### Prompt 1 — domain and deterministic data

```text
Read Seawolf-Rides-3-Driver-7-Rider-Plan-and-Codex-Prompts.md, especially
sections 2–5, and follow its common instructions. Implement Stage 1 only.

First reconcile this specification with the current checkout. Report any
material divergence before changing the agreed scenario. Do not repeat the
completed features or create UI in this stage.

Introduce the smallest shared dated driver-occurrence/rider-intent contracts
and selectors needed for multiple cars. A date-only Trip.id is insufficient.
Scope seats by driver occurrence and commitments by rider+date+direction+zone.
Keep participant, offer, intent, request, proposal and plan IDs distinct.
Use explicit adapters around existing V1 proposals/legacy records. Do not
globally rewrite existing Trip IDs or derive dates by parsing opaque IDs.
Reconcile normal driver proposal identities with existing public profiles.

Add the exact three drivers, seven riders, windows, limits, service and
walking assumptions, coordinates and directed fixture matrix from sections
3–4. Use fresh factories, not shared mutable fixture objects. Grace has no
confirmed point. Ava/Ben/Chloe here are separate namespaced synthetic records
from Friday. Register all ten stable profile identities using existing avatars.

Represent one authoritative driver contract per car. Do not pick its origin,
window or detour budget from whichever accepted rider happens to be first.
Add a separate combined-plan contract with revision ownership; retain V1
proposal compatibility. No accepted riders or pending per-car requests are
created by loading fixture data.

Test exact dates/zones, all counts, duplicate names with distinct IDs, two-seat
Ben, independent car capacities, cross-car rider commitment selectors,
unconfirmed Grace, zero co-located legs, directed asymmetry and factory isolation.
Verify the matrix is coherent and baseline limits are 40/30/10 minutes and
15/15/5 minutes respectively. Add no hardcoded feasibility outcomes to UI.

Run typecheck, lint and affected/full model tests. Report the resulting types,
adapters, files and checks. Stop at this stage; do not implement the solver,
acceptance or demo screen yet. No commit/push/merge/branch switch.
```

### Prompt 2 — complete-group scheduling

```text
Use the attached specification and Stage 1 contracts. Implement Stage 2 only:
a pure TO_CAMPUS group evaluator and bounded pickup-order selection.

Inputs are one authoritative driver occurrence, every accepted member, an
optional candidate, explicit order restrictions and typed directed estimates.
Return FEASIBLE with a complete schedule/metrics, INFEASIBLE with reasons,
or UNKNOWN. Never omit a member, invent missing constraints or route areas.

Implement the exact constraints and waiting policy in section 6. Include
both ends of all windows, pickup service once, egress walking, each rider's
extra in-vehicle time, seats, and TOTAL elapsed detour over the solo baseline.
Waiting is at explicit pickups and is represented in the schedule. Access
walking is not added to an already-ready pickup window.

For fixed order, use a small difference-constraint temporal solver (or prove
an equivalent exact method). Greedy earliest pickup or minute sampling alone
is insufficient. Detect infeasibility, derive the departure interval, minimize
elapsed duration, select the closest preferred departure within equal-cost
solutions, and return a consistent schedule. Preserve integer seconds and
closed boundaries. Respect existing agreed order/precedence restrictions.

Compare all permitted orders within the declared small stop bound; select
among fully feasible orders. Implement the status/search-completeness rules
in section 6. If an order is unresolved, do not claim global optimality.
Do not use the legacy pair evaluator's no-wait rejection as unsafe pruning.

Required tests: the specification's exact group outcomes/times; 30-minute
conflicting order versus 35-minute valid order; individually feasible Ava/Ben
but no shared schedule; sufficient seats but combined timing failure;
earlier passenger ride-limit violation; egress deadline; total detour after
several individually small additions; planned waiting before boarding;
one-second feasible interval; boundary equality; directed legs; incomplete
and unreachable estimates; locked order; no riders; invalid runtime inputs.
Cross-check tiny generated cases against an independent exhaustive schedule
oracle, including allowed waiting, rather than tests mirroring the solver.

No network or screen integration yet. Run typecheck, lint and the full suite.
Explain the solver, objective and supported bounds. Do not commit or push.
```

### Prompt 3 — routing efficiency and consistency

```text
Implement Stage 3 using the specification and existing OSRM adapter.
Keep RoutingAdapter.route compatible. Add a shared directed-leg estimate
source with fixture and live implementations; no new provider or dependency.

Deduplicate exact endpoint pairs, including the same public station reused
by different people. Preserve direction. An identical confirmed coordinate
may have an explicit zero leg; an unavailable leg may not. Grace is not routed.
Share baselines and in-flight work across all three drivers. Bound total
scenario network concurrency (initial default 3), not just each nested loop.

Use provider/profile/options, endpoints, mode and estimate metadata in cache
ownership. Distinguish discovery reuse from acceptance freshness. Document
chosen local-demo TTLs; do not imply a freshness timestamp proves live traffic.
Support cancellation, retries, root generations and late errors as well as
late successes. Do not cache a transient failure as permanent no-route.

Plan using numerical legs; request full ordered geometry only for selected
previews or accepted plans. Validate leg count, ordered stops and existing
pickup-snap limit. Revalidate a plan if geometry-stage durations differ from
the planning matrix. Mark stale/unknown or retry when it no longer fits.
Never combine fixture metrics with live geometry without separate explicit
labels, and never silently fall back from live failures to fixtures.

Add observable counters for unique leg work, cache hits, geometry requests,
concurrency, evaluation/provider time and stale results. Tests must cover
global concurrency, shared cancellation ownership, asymmetric cache keys,
generation changes, retry and malformed data. For a fully expanded fixture,
there are at most 31 unique nonzero directed pairs after coordinate reuse;
geometry requests are separate and must not occur per permutation.

No new UI or acceptance behavior. Run typecheck, lint, routing tests and
full relevant regressions. A small live smoke probe is optional and must
report actual outcomes; do not load-test the public OSRM service.
Report call counts and limitations. No commit/push/branch changes.
```

### Prompt 4 — recommendations against occupied cars

```text
Implement Stage 4: group-aware recommendations for the three-car scenario,
using the Stage 1 data, Stage 2 evaluator and Stage 3 travel source.

For each driver occurrence, evaluate every eligible uncommitted rider as an
addition to that car's accepted group. With empty cars, expose the initial
3×7 result set. Recommendations are alternatives, not reservations or already
accepted requests. Do not create automatic global assignments.

Use one authoritative driver contract, exact date/direction/zone, current
membership and current rider commitment state. Apply safe eligibility checks
before expensive routing. Do not exclude useful along-route pickups with a
home-only radius. Do not use the no-wait pair evaluator as unsafe pruning.

Rank only FEASIBLE additions by the exact policy in section 6. Display both
incremental elapsed time over the current group and total added time over
solo; the cap always applies to the total. Preserve all existing promises.
Return structured explanations and complete/unresolved search metadata.

Results and proposed plans must be owned by occurrence, driver/input revision,
membership revision, rider-intent revision, routing mode and root generation.
Membership, date, windows, point or mode changes invalidate old results.
Selecting a profile must not invalidate or mutate the world.

Assert the computed initial table: 9 FEASIBLE, 9 INFEASIBLE and 3 UNKNOWN
edges, with seven distinct riders. After Jordan accepts Ava, Ben must lose
eligibility for Jordan on combined timing while remaining possible for Morgan.
Verify Chloe's Jordan group has total +9 and incremental +7 minutes. Verify
unknown/provider failures receive no rank and Grace triggers no routing.

Keep this stage a reusable orchestration/model layer. Do not add a new screen
or acceptance shortcut. Run typecheck, lint and full tests. Report computed
rankings, reasons, state ownership and call counts. No commit/push/merge.
```

### Prompt 5 — acceptance and cancellation without stale plans

```text
Implement Stage 5, the shared local acceptance protocol in section 8.

Introduce an isolated three-car scenario state/reducer with authoritative
occurrence-scoped memberships and combined plans. Share pure validation and
combined-route acceptance services with existing dated driver/Friday adapters;
do not build a second independent implementation of the rules.

Routing/evaluation happens outside the synchronous mutation. Snapshot the
relevant state and proposal revisions, evaluate the full group, then atomically
commit membership plus plan only if the snapshot and freshness still match.
Recompute within a bounded policy or return STALE/RETRY after a conflict.
Guard generation changes even when reset/reload uses stable participant IDs.

Require actual pending proposal identity, matching driver/offer/occurrence,
current capacity, no duplicate rider commitment across all three cars,
current unexpired pending proposal, and complete group feasibility. Rejection
preserves state and the old plan. Pending requests reserve no seats. Already
accepted riders do not disappear when their original proposal TTL passes.

An explicit demo action may create a test request and simulate its acceptance
through these same services, clearly labeled. Loading data does neither.
Cancellation removes only that exact membership and invalidates/recomputes
the affected derived plan. It never reassigns riders automatically.

Adapt the existing Friday dated-driver path where its complete contracts are
available, so a known jointly impossible addition is not accepted merely
because seats fit. Preserve legacy labels and compatibility: incomplete legacy
records must not be promoted to fully verified group plans by invented values.
Keep external normal-flow limitations explicit; no backend security claims.

Update existing acceptance callers to await the result and expose a checking
state. Do not optimistically advance ReviewRequestsScreen, increment seats,
or report acceptance before the verified commit succeeds. Show actionable
rejection/retry reasons; profile viewing must not cancel or duplicate the action.

Tests must exercise competing async acceptances on the same car, the same
rider across different cars, another car's seats not being counted, two-seat
parties, cancellation during routing, expiry during routing, reset/reload
during routing, duplicate taps, stale plans and unchanged rejected state.
Retain the existing Friday outcomes using valid combined fixture legs, not
an adapter that simply assumes all groups are feasible.

Run typecheck, lint and full tests. Report transition codes, revision coverage,
normal-flow compatibility and any blocked incomplete records. No commit/push.
```

### Prompt 6 — app and map presentation

```text
Implement Stage 6 in the existing Carpool Matching Demo entry. Retain its two
current cases and add “Three cars / seven riders”; do not create another
top-level demo button. Keep Friday's existing Developer tools workflow intact.

Use a small dedicated scenario panel/controller and reusable map layers;
do not put another optimizer/state engine inside MapScreen or a large JSX file.
Keep an isolated provider alive across this Map-stack demo and profile modals.
Switching simulated actors must not change the signed-in account or commute.

Flow: choose scenario → Load data → select a named car → Find matches →
select a rider → preview the full addition → explicitly accept the test request.
Use the Stage 5 service. Show selected car seats, accepted rider names, current
group schedule and reasons for exclusions. Loading and repeated loading must
not auto-accept anyone or erase accepted memberships; reset is explicit.

Map: three distinctly colored named car markers, seven rider markers/areas,
and Tabler. Grace is visibly approximate. Support co-located station markers
through accessible lists/callouts without changing routing coordinates.
Cards and markers select the same stable entity. Selected car baseline is gray;
proposed additions are dashed/distinctly labeled; accepted group routes use
their car color. Keep other accepted cars visible/dimmed as appropriate.
Fetch geometry lazily and show only current validated layers. Do not draw a
route through all seven riders or all three cars.

Reuse full-screen expansion, recentering and profile modals. Avatar taps open
profiles; they do not select/accept a request accidentally. Preserve drafts,
selection, camera and state on profile open/close. All ten participants have
stable, clearly synthetic profiles. Ben is two seats but one pickup marker.

Default to Fixture with “Schematic — not a road route.” Live OSRM is explicit
and may differ. Switching mode/date requires a clearly labeled reset of this
demo's memberships/results, cancels old work and preserves normal/Friday data.
Put raw inputs, formula details, cache counters and technical errors behind
disclosures. Keep essential reasons such as no seats/missing pickup visible.
No navigation from schematic routes. Existing real navigation is unchanged.

Guard production access, including direct links to new synthetic profile IDs,
and keep test records local. Run typecheck, lint,
full tests and Android export. Perform device checks if available; otherwise
state that limit. Report exact phone steps. No commit/push/branch switch.
```

### Prompt 7 — regression and presentation acceptance

```text
Complete Stage 7 using section 11 of the specification. Do not add features.

Run the full automated suite under Node 24.21.0, typecheck, full source lint,
Android export and diff checks. Verify production guards and absence of normal
account/Friday mutations. Do not suppress real findings to report green checks.

Exercise the exact initial result table and both walkthroughs. Verify that
accepted windows/points/seats remain authoritative and every displayed schedule
comes from the accepted combined plan. Confirm no order is called feasible
just because its road duration is shortest.

Test poor provider results, partial missing legs, distant snap, cancellation,
double tap, stale success/error, same-rider cross-car competition, state change
during geometry fetching, expired pending proposals, accepted TTL survival,
mode/date reset, profile modal return, overlapping markers and full screen.

Measure fixture request budgets, orders evaluated and timing on the available
runtime/device. Report environment and numbers; do not claim production scale
or phone responsiveness from a desktop unit test. Live OSRM gets only a small
smoke check with outcomes reported honestly.

Update the project documentation with a two-minute presentation script,
expected fixture outcomes, Live mode differences, local-storage behavior,
supported mathematical bounds and known limitations. Keep one concise visible
demo flow; diagnostics stay collapsed. Preserve the original Friday case.

Provide a concrete review summary: changed files, shared contracts, acceptance
invariants, checks actually run, outstanding device/native items and exact
phone steps. State whether each stage's exit gate is satisfied. No commits,
pushes, merges or branch switches.
```

## 11. Phone acceptance scripts

These are **future acceptance criteria**, not claims that the uploaded app already contains the three-car demo.

### Walkthrough A: schedule conflict despite enough seats

1. Open Map → Carpool Matching Demo → Three cars / seven riders. Choose Fixture and load.
2. Check three named cars, seven riders, one campus point, zero accepted memberships. Profiles open without side effects.
3. Select Jordan and find matches. Ava and Ben each appear feasible with an empty car. Emi fails timing, Finn fails detour, Grace needs a confirmed pickup.
4. Preview Ava and explicitly accept her test request. Jordan has 1/3 seats used.
5. Re-evaluate Ben. His two seats fit the two remaining seats, but the combined ready windows do not. Acceptance is blocked; Ava and her plan remain unchanged.
6. Select Morgan. Ben still fits this different empty car. Accept Ben; Morgan has 2/3 seats used. Jordan remains 1/3.
7. Select Jordan and accept Chloe. Jordan has 2/3 used, Ava → Chloe, departure 08:00, vehicle campus 08:49, rider destinations 08:54, total +9 min and incremental +7 min.
8. Select Taylor and accept Diego. Taylor has 1/2 used, campus 08:32, rider destination 08:37.
9. Overview shows four accepted rider requests using five passenger seats across three cars, each pickup exactly once. Emi, Finn and Grace remain unmatched. No algorithm should claim it globally optimized this manual assignment.
10. Expand the map and open profiles; return without changing membership, routes or selected actor.

### Walkthrough B: capacity and cross-car commitment

1. Reset this scenario only. Reload Fixture.
2. Select Morgan. Accept Ben, then Chloe. Morgan has 3/3 seats used and the verified Ben → Chloe plan.
3. Attempt Diego in Morgan's car. Capacity rejects the request without changing Morgan's plan.
4. Select Taylor. Diego remains available and can be accepted there.
5. Attempt to accept Chloe in Jordan's car. Reject/exclude her because she is already committed to Morgan for this occurrence.
6. Cancel Chloe's exact Morgan membership. Morgan returns to 2/3 seats, the route is invalidated/recomputed, and Chloe becomes eligible for other cars after fresh evaluation. No automatic reassignment occurs.
7. Repeat with deliberately delayed routing: start one acceptance, then reset, cancel or change the group before it completes. The late result must not resurrect a request or stale route.

### Live and regression checks

- Explicitly reset and switch to Live OSRM. Confirm real road geometry and provider labels, while classifications/times are allowed to differ from the fixture table.
- Provider failure must show retry/unknown; fixture classifications must not quietly reappear.
- Grace causes no exact-routing call until a point is explicitly confirmed.
- Pending proposal expiry blocks acceptance and offers a fresh evaluation. Accepted memberships remain after TTL expiry.
- Leave and return through a profile modal; verify selection/camera/membership continuity. Test iOS close controls and Android Back where available.
- Run the original Friday loader and normal app flows afterward. No three-car records should appear there, and the signed-in weekly role/commute must remain intact.
- Navigation/GPS testing is separate. The synthetic Queens origin does not relocate the phone, and schematic lines must not launch turn-by-turn navigation.

## 12. Research and confidence boundaries

The original recommendation was constraint-based route insertion with time windows. The new group layer follows that direction. Feasible-trip generation and later vehicle assignment are supported by [Alonso-Mora et al. (2017)](https://www.pnas.org/doi/10.1073/pnas.1611675114); this plan does not implement that paper's complete fleet-dispatch system. [Haferkamp and Ehmke (2020)](https://ucrisportal.univie.ac.at/en/publications/an-efficient-insertion-heuristic-for-on-demand-ridesharing-servic/) motivates fast acceptance/route-feasibility checks. [Mobicoop's matcher](https://git.coopgo.io/ncaron/matcher/src/branch/next-release/README.md) documents carpool searches with schedules, seats, waypoints and detour constraints. [OSRM](https://project-osrm.org/docs/v5.24.0/api/) supplies road estimates and geometry, not carpool acceptance decisions.

The exact temporal-network formulation, fixture numbers, ranking order, stop bounds, cache policy, UI stages and test scripts are engineering proposals for this project. They are not market research findings, a benchmark, or a claim to reproduce Uber's proprietary matching. The planning oracle verifies the proposed synthetic cases; the staged implementation still needs its own independent regression and device checks.

At three drivers/seven riders, no global solver is required for recommendations. There are 21 initial pair edges, and each proposed addition explores only permitted orders of its car's current group. The earlier 777 count describes all nonempty ordered lists of up to three riders per driver under a one-seat-each assumption; Ben's party and the current-group recommendation workflow make that an upper-bound illustration, not a required API-call count or a workload measurement.

If automatic pool formation is later requested, add a separate stage generating feasible driver/group/route plans and selecting nonoverlapping plans. Do not approximate several passengers in one car by independent duplicated seat nodes while ignoring their joint route effects.
