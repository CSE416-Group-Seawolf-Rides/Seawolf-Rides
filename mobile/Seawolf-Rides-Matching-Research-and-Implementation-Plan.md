# Seawolf Rides: matching research and implementation plan

Research date: October 8, 2026, America/New_York.

## 1. Decision

Implement **constraint-based route insertion with time windows, followed by recurring-commute recommendation ranking**.

The first feature should answer two questions using the same feasibility engine:

- For a driver: which riders can fit this commute without violating anyone's schedule or the driver's detour limit?
- For a rider: which drivers can serve this trip within the rider's pickup, arrival, walking, and ride-time limits?

Return a ranked list of people, concrete feasible days and directions, an estimated pickup/arrival plan, and explanations. The user chooses whom to contact. A recommendation does not reserve a seat. Accepting a request requires a fresh check against the driver's entire confirmed route.

The reasoning behind this recommendation is specific to the product: users already plan to commute, drivers have their own origins and destinations, cars have few spare seats, campus trips recur, and users initiate requests. A large fleet dispatch solver solves a different operational problem. Research on ride-sharing, meeting points, and insertion provides the components needed here [S1–S7]. This recommendation is my synthesis; no cited paper establishes one universally best algorithm for Stony Brook.

**Recommended M3 scope:** one dated commute direction, one driver, several candidate riders, actual road travel durations, explicit time windows, ranked suggestions, explanations, and a map showing the selected feasible route. Use the same evaluator to demonstrate the rider search. Then add recurrence and route insertion for already confirmed riders.

## 2. Project constraints from the supplied breakdown

The source is `Project-breakdown-as-of-10-6-26.txt`. This is a project assessment dated October 6, not a fresh audit of the current repository.

Relevant reported state:

- React Native/Expo and strict TypeScript; Firebase is present but most operational state is local.
- Commute setup stores approximate starting area, campus destination, weekdays, arrival/departure preferences, day-specific role, and driver seats.
- The current driver ranking uses fixture schedules, shared days, time similarity, and campus lot preference. It has no geographic detour calculation.
- Exact location is discarded after a privacy transformation; stored data is approximately a two-mile area.
- `commuteModel.ts`, `rideModel.ts`, and `RidesProvider.tsx` contain existing domain/state behavior.
- Recurring commutes become dated trips, typically over a 14-day horizon; individual dates can be skipped.

Consequences for the implementation:

1. Existing arrival/departure preferences need explicit meanings and tolerances. A single preferred time does not identify an earliest departure, a hard arrival deadline, or the willingness to arrive early.
2. An approximate area is enough for discovery but does not identify a pickup spot or support minute-level schedule claims.
3. Compute separate plans for going to campus and leaving campus.
4. Preserve date exceptions, role conflicts, and confirmed reservations when replacing placeholder ranking.
5. Begin with a pure TypeScript matching module and fixtures. Move trusted evaluation and acceptance to a server when the team connects real users.

## 3. What the research actually contributes

### Papers, ordered by usefulness for this project

| Research | Relevant contribution | What to take into Seawolf Rides | Limits of applicability |
|---|---|---|---|
| Agatz, Erera, Savelsbergh, Wang, *Optimization for dynamic ride-sharing: A review* (2012) [S1] | Overview of matching and optimization problems involving itineraries and schedules | Vocabulary and problem classification; distinguish route feasibility from assignment | A review, not a complete implementation recipe; repository abstract/metadata inspected |
| Stiglic, Agatz, Savelsbergh, Gradisar, *The benefits of meeting points in ride-sharing systems* (2015) [S2] | Explicit pickup/drop-off meeting points and time feasibility | User-selected meeting spots, access/egress walking, pickup time-window intersection | The model restricts a shared trip to one common pickup and one common drop-off; it does not directly solve arbitrary sequential home pickups |
| Mallus et al., *Dynamic Carpooling in Urban Areas: Design and Experimentation with a Multi-Objective Route Matching Algorithm* (2017) [S3] | Separates temporal/geographic matching; explores partial sharing through walking | Filter schedules, then evaluate the geographic route; treat walking as user-limited | Dynamic urban CLACSOON setting; publisher/institutional abstract and indexed method text inspected, full PDF retrieval blocked |
| Ouyang, Yang, Daganzo, *Performance of reservation-based carpooling services under detour and waiting time restrictions* (2021) [S4] | Analytical treatment of reservation-based pooling and tolerance tradeoffs | Make detour/wait tolerance explicit; evaluate its effect on coverage | Idealized service-performance model rather than code for ranking individual commuters; abstract/indexed text inspected |
| Haferkamp and Ehmke, *An Efficient Insertion Heuristic for On-Demand Ridesharing Services* (2020) [S5] | Examines fast acceptance/feasibility checks and rescheduling | Route insertion and bounded computation | Dynamic dial-a-ride, not recurring student recommendations; publisher abstract inspected |
| Gong, Zeng, Chen, *A Fast Insertion Operator for Ridesharing over Time-Dependent Road Networks* (2023) [S6] | Treats pickup/drop-off insertion when travel times depend on departure | Traffic belongs in route feasibility; do not add leg ETAs evaluated at an unrelated time | Advanced insertion acceleration is unnecessary for a few riders; abstract and PDF inspected |
| Alonso-Mora et al., *On-demand high-capacity ride-sharing via dynamic trip-vehicle assignment* (2017) [S7] | Feasible request groups followed by constrained fleet assignment | Inspiration for a future group-generation/assignment stage | Real-time fleet dispatch; institutional abstract and indexed method description inspected, full-paper fetch blocked |
| *Multi-Objective Planning of Commuter Carpooling under Time-Varying Road Network* (2024) [S8] | Combines commuter routing objectives, traffic prediction, and NSGA-II | Confirms that driver/rider interests can be distinct objectives | CNN/LSTM forecasting and evolutionary search add substantial machinery; publisher indexed abstract inspected |

No performance percentages from these experiments should be presented as expected performance for this app. Participation density, destinations, tolerance settings, road topology, and demand differ.

### Algorithms compared

| Method | Use here | Reason |
|---|---|---|
| Home-to-home distance / Haversine | Coarse discovery, diagnostics, test baseline | Ignores where the driver is already going and the road network |
| Point-to-route/polyline distance | Optional inexpensive candidate ordering | Near a highway line does not imply an accessible exit or safe pickup |
| Dijkstra / A* | Inside a routing engine | Finds paths; does not decide schedule compatibility or whom to suggest |
| Time-window feasibility + insertion cost | Main evaluator | Produces a concrete route and schedule while enforcing user limits |
| Small exact enumeration | Useful for a few confirmed riders or an optional small group planner | Capacity is small; route-order search can be transparent and exact within a restricted candidate set |
| Greedy insertion | Useful when adding a rider to an existing route | Evaluate each permitted insertion position and select the least costly feasible result |
| Hungarian / min-cost flow | Future one-rider-per-driver automatic assignment | Assigns independent pair edges; cannot represent the joint route effects of several riders sharing a car |
| Gale–Shapley / stable matching | Possible future preference allocation | Assumes an allocation problem; group-dependent route feasibility complicates fixed preferences |
| OR-Tools routing or integer optimization | Later group/fleet optimization | Useful if automatic assignment or many pickup/drop-off points become a requirement |
| K-means / DBSCAN | Optional broad geographical grouping | Geographic clusters do not enforce ready times, arrival deadlines, or total detour |
| Genetic algorithms / NSGA-II | Research extension | Unnecessary complexity for the first working feature |
| ML / reinforcement learning | Later acceptance-probability reranking with actual data | No current interaction dataset; physical feasibility still needs explicit constraints |

## 4. Separate four responsibilities

1. **Discovery:** retrieve users who might fit, using cheap schedule and region checks.
2. **Feasibility:** construct a route and schedule that satisfy every applicable hard limit.
3. **Ranking:** order feasible alternatives by preferences and recurrence coverage.
4. **Commitment:** after consent, reserve capacity and update a confirmed plan using current state.

A score cannot override a failed arrival deadline. A nearby rider is not necessarily feasible. A high-scoring suggestion is not a confirmed seat. Keeping these responsibilities distinct prevents much of the common matching logic from becoming inconsistent.

The same feasibility function always receives the actual driver offer and actual rider request, even when the rider initiated the search. Search direction changes candidate retrieval and the ranking objective, not the physical definition of a feasible trip.

## 5. Inputs and their exact meanings

Use meters for distances, integer seconds for durations, and explicit timestamps for dated occurrences. Weekly times should be local wall times plus `America/New_York`, then expanded to dates. Do not persist weekly schedules as fixed UTC offsets because daylight saving time changes the offset.

| Input | Driver | Rider |
|---|---|---|
| Trip occurrence | Date, direction, role for that occurrence | Date and direction needed |
| Origin | Routing start anchor, with an accuracy label | Home area for discovery; selected pickup meeting spot for routing |
| Destination | Actual campus vehicle endpoint / home endpoint | Required campus destination or selected drop-off point |
| Departure/ready window | Earliest and latest permitted departure from origin | Earliest ready and latest acceptable pickup at meeting spot |
| Arrival window | Earliest acceptable and latest acceptable arrival at driver's endpoint | Earliest acceptable and latest required arrival at rider's destination |
| Preferred time | Desired departure or arrival inside the allowed window | Desired arrival or pickup inside the allowed window |
| Capacity | Passenger seats, confirmed passenger count, seats remaining | Seats requested, normally one |
| Extra travel limits | Maximum added trip duration and optionally a percentage cap; optional distance cap | Maximum in-vehicle excess duration; optional total door-to-destination duration limit |
| Walking | Driver generally has parking/walking overhead at campus | Maximum access/egress walking duration and actual walk legs |
| Waiting | Permitted driver waiting policy | Allowed pickup window already encodes how long the rider may wait |
| Existing commitments | Ordered confirmed stops and promised pickup/arrival windows | Conflicting trips and skipped dates |

Distinguish arrival at a parking/drop-off point from arrival at class. If class starts at 9:00 and walking plus the chosen arrival buffer takes 10 minutes, the vehicle-arrival deadline is 8:50. Do not add the same buffer twice. The meaning of the existing app's arrival field needs to be fixed in the model and UI before calculation.

Driver and rider tolerances need not be symmetric. A rider may accept arriving 20 minutes early but zero minutes late. A driver may accept 8 minutes of detour while a rider accepts only 5 minutes of extra in-vehicle travel.

Starting configuration for a demo, **not research-established constants**:

| Parameter | Initial demonstration setting | Interpretation |
|---|---|---|
| Driver maximum extra duration | 10 minutes | User can change it |
| Driver percentage limit | 30%, if both limits are enabled | Enforce the stricter of the two limits |
| Pickup service time | 90–120 seconds per stop | Include boarding time, even when pickup is directly on route |
| Arrival lateness | Zero past the hard deadline | Early arrival tolerance is separate |
| Maximum walking | 5–10 minutes, selected by rider | Walking route must actually be accessible |
| Forecast buffer | Explicit configurable margin | An engineering margin, not a calibrated probability guarantee |
| Planning horizon | Existing 14-day dated-trip horizon | Respect skips and exceptions |

If the driver enables both absolute and fractional detour limits, for solo baseline duration `B > 0` use `limit = min(maxExtraSeconds, maxExtraRatio * B)`. If only one is enabled, use that one. Handle zero/near-zero baselines explicitly; do not divide by zero or silently make a percentage limit meaningless.

## 6. The core geographic calculation

For a morning trip with a shared campus endpoint:

- `S`: driver's start.
- `P`: rider's selected pickup.
- `C`: campus vehicle endpoint.
- `T(a,b)`: road travel duration under the chosen routing conditions.
- `D(a,b)`: road distance on the route used for the duration calculation.
- `sigma`: pickup service duration.

Solo baseline:

`B = T(S,C)`

Via-rider duration, without driver waiting:

`L = T(S,P) + sigma + T(P,C)`

Driver extra duration:

`extra = L - B`

Distance detour:

`extraMeters = D(S,P) + D(P,C) - D(S,C)`

This is the primary distance-related measure: the additional route burden, not distance between homes. If the objective is time, use time-consistent baselines and legs. Do not compare a fastest-time shared route against a shortest-distance solo route as though the routing objectives were identical.

Under consistent static shortest-time routing, triangle inequality implies the extra driving time is nonnegative before service time. Small negative values can arise from provider differences, snapping, time buckets, or data freshness. Investigate material negative values; clamp only numerical noise and keep the raw metrics for diagnostics. For traffic-aware routes at different departure times, the comparison needs a consistent baseline policy.

If the rider needs a different campus endpoint `Q`, test legal drop-off orders such as `S -> P -> Q -> C` and `S -> P -> C -> Q` only if the driver permits the latter and has a deadline at `C`. Check each person's own arrival, not just the driver's final stop. A simpler first version can use mutually accepted shared campus drop-off points and include the rider's onward walk.

For a return trip, campus is the start and the rider's home/meeting point is a drop-off along the driver's homeward route. The request begins with the rider's campus-ready time. The road durations must be recomputed in the return direction; reversing the morning polyline does not establish a valid or equal-duration return route.

## 7. Exact schedule feasibility for the simple first version

For M3, use static forecast travel durations and **no planned driver waiting between stops**. Permit selection of a departure time inside the driver's allowed departure window. This assumption makes feasibility exact and inexpensive within that model. It can reject trips that would work with explicit en-route waiting; that is a stated product/model limitation, not a general impossibility result.

Let:

- Driver departure window be `[E_d, L_d]`.
- Driver arrival window at `C` be `[A_d_min, A_d_max]`.
- Rider pickup window at `P` be `[E_r, L_r]`.
- Rider arrival window at the required destination be `[A_r_min, A_r_max]`.
- Access walking already be incorporated in the rider's ready-at-`P` window.
- `w` be egress walking from `C` to the rider's actual destination.
- `a = T(S,P)`, `b = T(P,C)`, `L = a + sigma + b`.

For departure time `t`, pickup starts at `t+a`, boarding finishes at `t+a+sigma`, the vehicle reaches `C` at `t+L`, and the rider reaches their destination at `t+L+w`.

Therefore:

`lower = max(E_d, A_d_min - L, E_r - a, A_r_min - L - w)`

`upper = min(L_d, A_d_max - L, L_r - a, A_r_max - L - w)`

The pair is schedule-feasible iff `lower <= upper`, after detour, capacity, access/egress walking, rider ride-time, and conflict checks. This produces an actual feasible departure interval. Similar clock times alone do not.

Choose a departure inside that interval to minimize the requested soft objective. For example, project a preferred departure into `[lower, upper]` using `clamp(preferredDeparture, lower, upper)`. If minimizing multiple absolute deviations, evaluate their breakpoints and interval endpoints; simply clamping one person's preference is a policy choice rather than a joint optimum.

Do not calculate feasibility using rounded display minutes. Round only the explanation shown in the UI. Boundary equality is feasible in the deterministic model; practical buffers must already be reflected in constraints or forecast durations.

### Worked example

All durations below are illustrative, not measured Stony Brook routes.

| Quantity | Value |
|---|---|
| Solo `S -> C` | 30 minutes |
| `S -> P` | 10 minutes |
| Pickup service | 2 minutes |
| `P -> C` | 25 minutes |
| Shared route duration | 37 minutes |
| Driver extra duration | 7 minutes |
| Driver departure window | 8:00–8:15 |
| Driver arrival window at `C` | 8:35–8:50 |
| Rider pickup window at `P` | 8:12–8:25 |
| Rider arrival window at actual destination | 8:30–8:45 |
| Rider egress walk | 5 minutes |
| Driver detour limit | 10 minutes and 30% of solo duration = 9 minutes |

Translated departure intervals:

- Driver departure: 8:00–8:15.
- Driver arrival: 7:58–8:13.
- Rider pickup: 8:02–8:15.
- Rider arrival including walking: 7:48–8:03.

Intersection: **8:02–8:03**. A departure at 8:03 gives pickup at 8:13, vehicle arrival at 8:40, and rider arrival at 8:45. The 7-minute detour satisfies the stricter 9-minute limit.

Omitting the walk would incorrectly allow departure as late as 8:08, causing the rider to reach their destination at 8:50. This is why campus lot matching cannot be only a cosmetic preference.

## 8. Ranking people and explaining suggestions

Start with an explicit ordering, not a single arbitrary compatibility percentage:

1. Among feasible alternatives, maximize fully covered requested days when the user requests a round trip.
2. Maximize covered requested directed legs/occurrences.
3. Minimize the caller's soft inconvenience cost.
4. Prefer more timing slack, then apply a stable ID tie-breaker.

For a one-way query, skip the full-round-trip criterion. The query must specify the requested days/legs; do not reward a driver's unrelated availability on days the requester does not need. An individual with some feasible days may still be a useful partial match, so list those days explicitly unless the user selected an all-days requirement.

For equally covered alternatives, a transparent initial cost is a weighted sum of normalized metrics. The following weights are proposed defaults to test:

`driverCost = 0.50*normalizedDriverExtra + 0.30*normalizedDriverScheduleShift + 0.20*normalizedRiderWalking`

`riderCost = 0.50*normalizedRiderArrivalShift + 0.30*normalizedRiderExtraRide + 0.20*normalizedRiderWalking`

Normalize by declared tolerances rather than raw units. Driver extra duration, for example, is divided by the active driver detour limit. For asymmetric early/late preferences, normalize using the tolerance on the applicable side of the target. Zero tolerance means the value must already be zero to be feasible; do not divide by zero. If a metric is disabled or unknown, omit it with an explicit policy rather than inventing a zero-cost measurement.

These costs are preference indices. They are not probabilities of acceptance. Use the same underlying measurements for both search directions, but choose the feasible plan and rank alternatives according to the caller's objective. Independent searches may select different acceptable departure times until users agree on a plan.

Example explanation:

> Works Monday and Wednesday mornings. Estimated pickup 8:13 at your selected meeting spot. Adds about 7 minutes to the driver's trip. Vehicle reaches campus at 8:40, with a 5-minute walk to your destination. Pickup and arrival fit both schedules.

Generate explanations from structured facts and reason codes. A language model is not needed. Useful rejection codes include `NO_SHARED_OCCURRENCE`, `ROLE_CONFLICT`, `NO_SEAT`, `NO_ROAD_ROUTE`, `PICKUP_WINDOW_MISS`, `ARRIVAL_DEADLINE_MISS`, `DRIVER_DETOUR_LIMIT`, `RIDER_RIDE_LIMIT`, `WALK_LIMIT`, and `LOCATION_UNCONFIRMED`. Distinguish an unknown route caused by an API failure from a proven infeasible route.

## 9. Several riders: individual suggestions versus a feasible group

Showing three riders who independently fit the driver's solo route does not establish that all three can travel together. Their detours, boarding times, and arrival constraints interact.

For example, A alone can add 6 minutes and B alone can add 6 minutes while a route serving both adds 14 minutes, exceeding a 10-minute limit. Summing individual detours is generally wrong too: riders near the same pickup may share an access detour, while riders in opposite directions may add much more.

### Adding a rider to a confirmed morning route

If all riders use an accepted common campus drop-off, maintain:

`[driverStart, existingPickup1, existingPickup2, ..., campus]`

For each candidate pickup:

1. Check available passenger seats for the occurrence.
2. Insert it in every allowed gap before campus.
3. Recalculate the complete schedule and route duration.
4. Check the driver, the new rider, and every existing rider.
5. Preserve already agreed pickup/arrival windows and any locked stop order.
6. Keep the least costly feasible insertion; return no suggestion if none fits.

For fixed static durations, insertion in an edge `u -> v` has local driving/service increment:

`delta = T(u,P) + sigma_P + T(P,v) - T(u,v)`

Use that increment to compare candidates cheaply, then validate the whole route. A small local increment does not prove that downstream deadlines or existing rider ride-time limits survive.

Check both **increment over the current confirmed route** and **total extra duration over the original solo route**. The former ranks the new rider's burden; the latter enforces the driver's overall detour budget. Otherwise each accepted rider can consume another apparently permissible 10 minutes.

For `k` existing pickups, there are `k+1` insertion positions. Fully simulating an `O(k)` route at each position takes `O(k^2)` work per candidate after travel times are available. With a few spare seats, routing/API latency will often dominate this arithmetic; measure rather than assume.

### Exact ordering for a small confirmed group

For a fixed group of three riders sharing a campus endpoint, only `3! = 6` pickup orders exist. Four riders have `4! = 24`. Enumerating all allowed orders can be practical. It is exact over that fixed group, route model, and permitted order set, not globally optimal over all users.

If an optional “suggest a whole pool” feature is needed, shortlist candidates, enumerate subsets up to remaining capacity, enumerate permitted orders, and evaluate each full plan. Twenty candidates and capacity three produce `20 + 190 + 1140 = 1350` nonempty subsets before route-order enumeration. Candidate truncation is a heuristic and can miss the best group.

When riders have different pickup and drop-off points, use pickup-before-drop-off precedence, evaluate load along each segment, and treat driver endpoints/deadlines explicitly. This becomes a pickup-and-delivery problem with time windows rather than a simple ordered-pickup route.

### Fixed-order schedule calculation for multiple riders

Under the M3 no-driver-waiting model, each stop has a fixed offset `offset_i` from departure. Translate every stop's window `[earliest_i,latest_i]` into `[earliest_i-offset_i, latest_i-offset_i]`, then intersect all of them with the driver departure window. Rider destination windows include egress walks. Check each rider's in-vehicle time from boarding completion to drop-off and the driver's total route duration. This is the multi-stop version of Section 7.

If explicit waiting is later enabled, define stop service-start variables `x_i` and enforce:

- `earliest_i <= x_i <= latest_i`.
- `x_(i+1) >= x_i + service_i + travelTime(i,i+1)`.
- Upper bounds on permitted leg waiting where required.
- `x_drop(r) - x_pick(r) - service_pick(r) <= maxRideSeconds_r`.
- Driver total elapsed duration and confirmed commitment limits.

For fixed static leg times and a fixed stop order, these are difference constraints. They can be checked with a simple temporal network/difference-constraint solver, or modeled in an optimization library. A forward earliest-arrival pass is enough for basic windows alone, but it can incorrectly reject a feasible plan when max ride duration interacts with downstream waiting: delaying departure or an earlier pickup can reduce the time someone sits in the car. Do not silently treat one failed greedy schedule as proof that no schedule exists.

For departure-dependent travel durations, the fixed-offset derivation no longer applies exactly. Use time-bucket estimates for discovery and recompute the shortlisted route at the proposed departure and subsequent leg-departure times. A sampled grid search is approximate and can miss narrow feasible intervals; label that tradeoff. Advanced traffic-aware insertion is a later stage [S6].

## 10. Recurring schedules and return trips

Represent the key as `(localDate, direction)`, not just weekday or person. Role, capacity, exceptions, and commitments can differ for each occurrence.

For each person pair:

1. Identify requested weekday/direction combinations with complementary roles.
2. Expand to upcoming dates using the app's horizon and local timezone.
3. Apply skipped dates, changed schedules, holiday/off-day exceptions, and existing conflicts.
4. Evaluate each candidate occurrence using that date's time windows, route forecast, and seat availability.
5. Aggregate into one person card with exact feasible legs.

Maintain both a recurring-template compatibility summary and dated availability. Two good weeks do not prove a perpetual recurring reservation. A confirmed recurring arrangement needs an effective date range and an explicit exception policy, with revalidation when schedules or membership change.

An inbound morning match and an outbound afternoon match are independent. If the query requires a round trip, a day counts as fully covered only when both required directions work. If the query allows one-way service, show the partial match. Do not reject a useful morning driver merely because the afternoon schedule differs.

For “both” users, resolve the role for the specific occurrence before generating an edge. Prevent the same person from simultaneously driving one pool and riding another on the same leg. Reuse the app's existing conflict semantics rather than creating a second incompatible interpretation.

## 11. Location privacy and meeting points

The current approximate circle cannot identify an actual home or pickup. A center may lie on an inaccessible road, away from an entrance, or far enough from the real location to alter feasibility. It cannot support an exact assertion such as “pickup at 8:13.” This is a data-model issue the matching formula cannot repair.

Recommended approach preserving the present area-based design:

- Keep the approximate home area for discovery and user cards.
- Ask the rider to choose an acceptable actual meeting spot and its ready/arrival windows.
- Route to that selected spot. Do not generate an arbitrary meeting point by projecting onto a highway polyline.
- Let the driver select a routing start anchor they are comfortable supplying. If it is approximate, label the plan as tentative until the driver verifies their start and schedule.
- Allow several rider-approved pickup options later; evaluate them separately and choose a feasible option.
- Incorporate the actual walking duration and user limit. Check accessibility before offering a spot.

Meeting-point research gives a direct precedent, but the published model uses common meeting-point pickups/drop-offs rather than unrestricted sequential stops [S2]. That distinction matters when adapting the method.

An alternative is explicit opt-in private precise locations evaluated only by a trusted backend, while public results retain approximate areas. This changes the existing collection/retention behavior and requires a clear product decision and user consent; do not silently retain a location the current app says it discards. Exact-origin route geometry also reveals that origin, so returning a full private-home route to unmatched users would defeat location masking even if the raw coordinate field is omitted.

When only area-level data exists, return “potential match; pickup needs confirmation” with appropriately coarse estimates, or require meeting-point selection before detailed matching. Neither adding a generic buffer nor evaluating a few sampled points proves every possible home in the area is feasible.

## 12. Routing provider and efficient retrieval

### Provider recommendation

For M3, first build the matching engine against a fixture routing adapter with deterministic road-duration matrices, then connect **OSRM** for road-based static estimates. This makes the logic reproducible and separates routing outages from algorithm failures. Use a hosted provider or self-hosted regional OSRM instance appropriate to the team; the public demo is for experimentation and has a usage policy, not a production service guarantee [S9–S10].

If historical/future traffic forecasts are a product requirement, add **Google Routes API** behind the same adapter. It supplies matrix and route endpoints; the matrix gives pairwise paths, while route requests provide a chosen waypoint sequence/geometry [S11–S12].

| Tool | Appropriate responsibility | Limitation |
|---|---|---|
| React Native Maps | Render markers, privacy circles, selected routes | A displayed map alone does not calculate routes or matching |
| OSRM Table | Obtain directed road-duration/distance matrices | Normally static estimates; deployment must supply any traffic updates |
| OSRM Route | Obtain geometry for a chosen stop order | Does not implement carpool schedules, capacity, or consent |
| Google Compute Route Matrix | Pairwise duration/distance evaluation | Different request limits for traffic settings; intermediate pickups belong in a route request |
| Google Compute Routes | Validate/render a shortlisted waypoint route | Waypoint optimization alone does not enforce all rider-specific constraints |
| OR-Tools | Model constrained group routing/assignment later | Separate optimization component; it still needs a travel-time model |

OSRM's `match` service means mapping a GPS trace onto roads. It is unrelated to driver/rider matching. Its `trip` service is not a replacement for your time-window and capacity evaluator [S9].

Google's current `ComputeRoutes` reference states that `arrivalTime` is ignored for non-transit modes. For driving, solve a desired-arrival commute by evaluating candidate departure times rather than assuming a driving “arrive by” API parameter solves it [S12]. Also, matrices calculated at one common departure time are an approximation for multi-leg routes whose later legs start at different times.

### Travel-time work for a single driver and many riders

For `n` candidates sharing one campus endpoint, the basic pair evaluation needs:

- One baseline `S -> C`.
- `n` values `S -> P_i`.
- `n` values `P_i -> C`.

That is `2n+1` needed directed leg values, excluding walking and distinct drop-offs. It does not require an all-users square matrix. Batch those values using selected sources/destinations when the provider permits; rectangular matrix requests may calculate extra elements, so account for actual elements requested.

For rider search over `m` drivers, similarly retrieve each `S_j -> P`, each `S_j -> C_j`, and the applicable `P -> C_j` legs. A shared `P -> C` value can be reused when destination and routing conditions match.

Filter complementary roles, requested dates/directions, obvious schedule impossibilities, and unavailable capacity before routing. Use conservative region retrieval. A fixed small radius around the driver's home loses riders farther along the commute. A narrow buffer around only one fastest route can also lose feasible alternatives. If a corridor is used for latency, treat it as a retrieval heuristic and measure lost feasible candidates against an unrestricted baseline.

For an initial small campus pilot, querying a schedule bucket on the server and checking its bounded candidate set may be simpler than building a complex spatial index. At larger scale, Firestore geohash queries can help with region retrieval, but they require false-positive filtering and are not route overlap tests [S14]. Cover the whole relevant route area, query neighboring cells/bounds, and deduplicate results.

Cache keys should include provider, routing profile, origin/destination or stop sequence, time bucket/date when relevant, route modifiers, coordinate precision, and data/version metadata. Recommendation caches additionally need commute, seat, exception, and confirmed-route versions. Revalidate immediately before commitment. Respect each provider's current rules for storage and display; a provider adapter does not itself grant unlimited caching rights.

Fetch route geometry only for the best few alternatives or a selected card. Use directed matrices, inspect per-element failures, reject null/unreachable values, and never substitute zero duration. Haversine fallback must remain an explicit rough/unknown estimate rather than proof that an actual road route exists.

### Traffic and uncertainty

Travel forecasts do not guarantee arrival. Use an explicit forecast basis and timestamp. A simple demonstration buffer is a declared engineering choice. With measured travel-time errors later, choose a percentile or reliability target and calibrate it against observed trips. Do not describe a 5-minute buffer as “95% reliable” without data.

Compare solo and shared routes under consistent routing settings and baseline policies. A driver's solo reference can be their declared usual route rather than the provider's mathematical fastest route if that is the route the driver actually permits; constrained route preferences must be carried into the adapter.

## 13. TypeScript boundaries and reference pseudocode

Keep geometry/API calls out of screen components. The following is a proposed contract, not code verified against the current repository.

```ts
type Point = { latitude: number; longitude: number };
type Direction = 'TO_CAMPUS' | 'FROM_CAMPUS';
type Window = { earliest: number; latest: number }; // epoch seconds per occurrence
type Accuracy = 'SELECTED_POINT' | 'APPROXIMATE_AREA';

interface DriverOffer {
  id: string;
  userId: string;
  occurrenceKey: string;
  localDate: string;
  timeZone: string;
  direction: Direction;
  start: Point;
  startAccuracy: Accuracy;
  finish: Point;
  departure: Window;
  arrival: Window;
  preferredDeparture: number;
  passengerCapacity: number;
  seatsRemaining: number;
  maxExtraSeconds?: number;
  maxExtraRatio?: number;
  maxExtraMeters?: number;
  confirmedRouteVersion: number;
  scheduleVersion: number;
}

interface RiderRequest {
  id: string;
  userId: string;
  occurrenceKey: string;
  direction: Direction;
  seatsRequested: number;
  pickup: Point;
  dropoff: Point;
  pickupWindow: Window; // ready at pickup, not ready at home
  destinationArrival: Window; // includes egress walk
  preferredDestinationArrival: number;
  accessWalkSeconds: number;
  egressWalkSeconds: number;
  maxWalkSeconds: number;
  maxExtraRideSeconds: number;
  scheduleVersion: number;
}

interface RouteEstimate {
  durationSeconds: number;
  distanceMeters: number;
  forecastBasis: 'FIXTURE' | 'STATIC_ROAD' | 'TRAFFIC_FORECAST';
  computedAt: string;
}

interface RoutingProvider {
  matrix(
    origins: Point[], destinations: Point[], departureEpochSeconds?: number
  ): Promise<(RouteEstimate | null)[][]>;
  route(
    stops: Point[], departureEpochSeconds?: number
  ): Promise<RouteEstimate & { polyline?: string }>;
}

interface FeasiblePlan {
  driverOfferId: string;
  riderRequestId: string;
  occurrenceKey: string;
  departureWindow: Window;
  proposedDeparture: number;
  proposedPickup: number;
  proposedVehicleArrival: number;
  proposedRiderDestinationArrival: number;
  driverExtraSeconds: number;
  riderExtraRideSeconds: number;
  egressWalkSeconds: number;
  remainingDepartureFlexSeconds: number;
  locationStatus: 'SELECTED_POINTS' | 'TENTATIVE';
  forecastBasis: RouteEstimate['forecastBasis'];
  driverRouteVersion: number;
  riderScheduleVersion: number;
}

type Evaluation =
  | { status: 'FEASIBLE'; plan: FeasiblePlan }
  | { status: 'INFEASIBLE'; reasonCodes: string[] }
  | { status: 'UNKNOWN'; reasonCodes: string[] };
```

Keep capacities and role/conflict checks in the trusted domain layer. The frontend uses these structures for rendering, but production users must not supply authoritative seat counts or bypass verification by forging a client-side result.

### Simple common-endpoint evaluator

```ts
// Pseudocode: static durations, one pickup, one accepted common drop-off,
// no planned waiting by the driver. Route/membership/conflict checks precede this.
function evaluateCommonEndpoint(driver, rider, legs, sigma) {
  if (driver.userId === rider.userId) return infeasible('SELF_MATCH');
  if (driver.occurrenceKey !== rider.occurrenceKey)
    return infeasible('NO_SHARED_OCCURRENCE');
  if (driver.seatsRemaining < rider.seatsRequested)
    return infeasible('NO_SEAT');
  if (!allLegsExistAndAreFinite(legs)) return unknownOrNoRoute(legs);

  const a = legs.startToPickup.durationSeconds;
  const b = legs.pickupToCampus.durationSeconds;
  const baseline = legs.startToCampus.durationSeconds;
  const shared = a + sigma + b;
  const extra = shared - baseline;

  if (extra > activeDriverLimit(driver, baseline))
    return infeasible('DRIVER_DETOUR_LIMIT');

  // Common-endpoint direct ride has no other rider stops in this example.
  // Access waiting/boarding is separate from in-vehicle ride time.
  const riderRide = b;
  const riderExtraRide = riderRide - legs.riderDirectRide.durationSeconds;
  if (riderExtraRide > rider.maxExtraRideSeconds)
    return infeasible('RIDER_RIDE_LIMIT');
  if (!walkPolicySatisfied(rider)) return infeasible('WALK_LIMIT');

  const lower = Math.max(
    driver.departure.earliest,
    driver.arrival.earliest - shared,
    rider.pickupWindow.earliest - a,
    rider.destinationArrival.earliest - shared - rider.egressWalkSeconds
  );
  const upper = Math.min(
    driver.departure.latest,
    driver.arrival.latest - shared,
    rider.pickupWindow.latest - a,
    rider.destinationArrival.latest - shared - rider.egressWalkSeconds
  );
  if (lower > upper) return infeasible('NO_FEASIBLE_DEPARTURE');

  const t = choosePreferredFeasibleDeparture(lower, upper, driver, rider);
  return feasiblePlan({
    departure: t,
    pickup: t + a,
    vehicleArrival: t + shared,
    riderDestinationArrival: t + shared + rider.egressWalkSeconds,
    driverExtraSeconds: extra,
    departureWindow: { earliest: lower, latest: upper }
  });
}
```

Do not copy this routine unchanged for return trips, distinct drop-offs, multiple riders, or time-dependent legs; compile those cases into the fixed-order stop evaluator described in Section 9. With a common endpoint and no other riders, the rider's extra in-vehicle time may be zero even though the driver detours before picking them up. Driver extra duration and rider extra ride duration are different measurements.

### Orchestration

```ts
async function recommend(query, candidates, confirmedState, routing) {
  const occurrences = expandRequestedOccurrences(query);
  const possible = cheapEligibilityFilter(query, candidates, occurrences);
  const routeData = await fetchNeededDirectedLegs(possible, routing);
  const byPerson = new Map();

  for (const candidate of possible) {
    const pair = orientAsDriverAndRider(query, candidate);
    for (const occurrence of sharedOccurrences(pair, occurrences)) {
      const evaluation = evaluateBestPermittedInsertion(
        pair, occurrence, confirmedState, routeData
      );
      appendOccurrenceResult(byPerson, candidate.userId, evaluation);
    }
  }
  return aggregateExplainAndRank(query, byPerson);
}
```

For rider search, `orientAsDriverAndRider` still assigns the driver offer to the driver argument and rider need to the rider argument. This avoids accidentally applying the rider's tolerance as the driver's detour limit.

### Suggested modules

| Proposed module | Responsibility |
|---|---|
| `matching/types.ts` | Shared requests, route metrics, results, reason codes |
| `matching/occurrences.ts` | Date expansion, direction/role selection, exceptions |
| `matching/eligibility.ts` | Cheap role, capacity, conflict, schedule checks |
| `matching/schedule.ts` | Fixed-order windows and schedule construction |
| `matching/insertion.ts` | Enumerate allowed insertion positions/orders |
| `matching/ranking.ts` | Aggregate recurring coverage and caller preferences |
| `matching/explanations.ts` | Structured explanations and reasons |
| `matching/routing/provider.ts` | Provider-independent interface |
| `matching/routing/fixture.ts` | Deterministic demo durations |
| `matching/routing/osrm.ts` | Static road routing adapter |
| `matching/routing/google.ts` | Optional forecast-aware adapter |

Place the pure modules alongside existing domain code for M3 or in a shared package when a server is introduced. File paths are suggestions derived from the supplied breakdown; reconcile them with the actual current checkout before editing.

## 14. Production request acceptance and capacity

Do not rely on a ranked recommendation's stored seat count. Two users may see the same remaining seat, or a newly confirmed rider may alter the whole route.

Recommended acceptance flow:

1. Authenticate the caller and identify the offer/request using stored records.
2. Read current commute, role, date-exception, rider-commitment, membership, and route versions.
3. Compute a new feasible plan including every confirmed rider.
4. In a short transaction, reread the relevant records/versions and verify that capacity and commitments still match the snapshot.
5. If anything changed, recompute against the new snapshot and retry the outer operation.
6. If unchanged, atomically write the membership/route update, reservation, and request status.
7. Deliver notifications after successful commitment, with idempotency protection.

Firestore transactions can retry and apply their writes atomically [S15]. Avoid expensive routing requests inside a transaction callback that can execute repeatedly. The snapshot/version check must cover all facts used in planning, including existing riders' promises, not just a counter on the driver record.

Pending requests should either not consume seats or use explicit expiring holds. Choose one rule and make it consistent with the UI. A ranked suggestion never consumes a seat by itself. A skip or cancellation must release the appropriate dated reservation without deleting an unrelated recurring agreement.

## 15. When global optimization becomes appropriate

If the product later asks the system to automatically construct pools, the objective changes from “suggest people to this user” to “allocate riders across drivers.”

For one rider per driver, construct feasible driver-rider edges. A maximum-cardinality matching followed by minimum cost among maximum-cardinality assignments can maximize service without selecting the empty assignment. If using one combined objective, unmatched penalties need a deliberate magnitude. Hungarian/min-cost flow can be appropriate in that independent-pair model.

For several riders per car, cloning the driver into independent seat nodes is not enough: individually valid edges may form an invalid route. Generate feasible **driver plus rider-set plus route** plans. Give each such plan a binary selection variable `x_(d,g)`:

- Each driver selects at most one group plan for the occurrence: `sum_g x_(d,g) <= 1`.
- Each rider belongs to at most one selected plan: `sum_(d,g:r in g) x_(d,g) <= 1`.
- Every generated plan already satisfies routing, capacity, time windows, and confirmed commitments.
- First maximize served riders, then minimize burden/other chosen costs; or apply a clearly specified equivalent policy.

This is a set-packing/group-assignment formulation. It captures group interactions; the Alonso-Mora request-trip-vehicle approach is a useful future reference [S7]. OR-Tools can help with constrained routing and optimization [S13]. Fixed confirmed arrangements should be preserved unless users explicitly agree to reassignment.

No global assignment solver is required to return ranked outreach suggestions in M3. User acceptance, social preferences, and weekly availability are not known simply because a mathematical allocation exists.

## 16. GitHub and implementation references

| Repository/reference | Inspected evidence | Useful part | Adaptation issue |
|---|---|---|---|
| [Project-OSRM/osrm-backend](https://github.com/Project-OSRM/osrm-backend) [S9–S10] | Official API docs and repository/demo guidance | Road-duration matrix, ordered route geometry | Routing engine, not a carpool matcher; static-profile and hosting considerations |
| [Leot6/AMoD2](https://github.com/Leot6/AMoD2) [S16] | README and exposed algorithm descriptions | Compare greedy insertion, single-request batch matching, and multi-request schedule pools | C++ simulation/fleet machinery; README describes Gurobi dependency; not run or fully audited |
| [DMadhuranga/rtv-dispatch](https://github.com/DMadhuranga/rtv-dispatch) [S17] | README, feasibility API, route/manifest contract | Explicit time windows, route manifests, insertion fallback, group assignment | Python paratransit/dial-a-ride model with OSRM and Gurobi; not run or fully audited |
| [Mobicoop V3 matcher](https://gitlab.com/mobicoop/v3/service/matcher), available through its [COOPGO mirror](https://git.coopgo.io/ncaron/matcher) [S18–S21] | README and TypeScript algorithm/query-handler files | Selection plus processing stages, recurrent journeys, detour metrics, result caching | More infrastructure than needed; documented AGPL license; the repository's defaults do not determine your campus settings |

Mobicoop's inspected `passenger-oriented-algorithm.ts` explicitly wires a selector and successive carpool path, basic route, geographic, detailed route, journey completion, and journey filtering stages [S19]. The abstract algorithm executes these processors over selected candidates [S20]; the query handler applies settings and uses cached results [S21]. This is concrete architectural evidence, not merely an “AI-powered matching” marketing claim.

Study structure and concepts before importing code. Verify licensing and dependencies at the point of adoption. No repository listed here has been installed, benchmarked, or certified as production-ready in this research.

## 17. Verification that matters

The matching engine changes meaningful behavior, so tests should assert feasibility and user commitments rather than only echoing score arithmetic.

| Case | Expected behavior |
|---|---|
| Rider near home but across an inconvenient road connection | Low home distance does not override excessive road detour |
| Rider far from driver's start but on the commute | Consider them when schedule and added burden fit |
| Good geography, incompatible ready/arrival windows | Reject with schedule explanation |
| Similar preferred arrival times, no valid departure intersection | Reject |
| Pickup directly on route | Include boarding/service time |
| Exact window boundary | Use unrounded internal timestamps; equality accepted under the declared model |
| Campus walk makes class arrival late | Reject or choose an earlier feasible departure |
| No road route or matrix element is null | Return infeasible/unknown as appropriate, never zero duration |
| Return-direction road times differ | Compute return separately |
| Driver at zero remaining seats | Do not recommend a reservable plan |
| Driver/rider is same user | Reject |
| Role is “both,” but already committed to ride | Do not also assign them to drive that leg |
| Two individually feasible riders jointly exceed detour | Reject combined route |
| New rider breaks an existing rider deadline | Reject insertion even if the driver's arrival still fits |
| Each insertion is within 10 minutes, total exceeds budget | Enforce total limit over the solo reference |
| Monday morning works, Monday evening fails | Label one-way only; do not count a covered round-trip day |
| Same weekday template but a date is skipped | Exclude that dated occurrence |
| Daylight saving transition | Expand recurring wall times in the named timezone |
| Approximate-only origin | Label tentative; avoid false precision |
| Two simultaneous acceptances for one seat | At most one succeeds after current-state validation |
| Same input/cost ties | Stable deterministic ordering |

For tiny scenarios, enumerate all candidate pickup orders and feasible departure intervals as a reference oracle. Compare the insertion heuristic to that restricted exact result. Use fixture matrices for deterministic unit tests and a separate small set of live road-routing checks for adapters.

Benchmark candidate retrieval against the unrestricted small population: what fraction of feasible matches did a geographic shortlist drop? Report this before optimizing for a faster but less complete shortlist.

Product evaluation should track:

- Fraction of queries with at least one feasible suggestion and number of feasible occurrences covered.
- Driver total/incremental extra duration; rider extra ride duration; walking burden.
- Predicted arrival slack and later observed prediction errors.
- Routing element count, cold/cached latency, and provider failures.
- Request initiation, acceptance, confirmation, cancellation, and completed recurrence coverage when real users exist.

Do not call the top-10 useful percentage “matching accuracy” without a defined labeling protocol. Separate deterministic constraint correctness from subjective ranking relevance and eventual human acceptance.

## 18. Implementation sequence and M3 acceptance criteria

1. **Define schedule semantics and anchors.** Add explicit pickup/departure windows, arrival deadlines, accepted meeting spots, and driver detour settings. Define campus arrival versus class arrival.
2. **Implement pure pair feasibility.** Use Section 7 with fixtures. Output valid departure intervals, a plan, and reason codes. Support one-way morning and return cases through a stop model.
3. **Implement ranking and both search directions.** Share one physical evaluator. Display actual feasible days/legs and burdens.
4. **Add a road routing adapter.** Use directed matrix values; draw the selected route with existing map infrastructure.
5. **Add confirmed-route insertion.** Recheck every existing rider and the cumulative detour budget.
6. **Expand recurrence.** Reuse the app's dated-trip generation/skip logic, extending it only where needed.
7. **Connect trusted persistence and acceptance.** Implement the concurrency-safe flow separately from recommendations.
8. **Measure coverage and tune.** Evaluate declared settings against scenarios and real user preferences. Introduce learned ranking or group optimization only when evidence establishes a need.

For the demonstration, make candidate fixtures deliberately different: one easy on-route rider, one nearby but expensive detour, one geographically good but too late, one alternative campus endpoint with an excessive walk, and one feasible partial-week match. Show both ranking and rejection explanations, then accept a rider and demonstrate that recommendations update against the changed route.

The M3 feature is complete when it shows a road-based baseline and via-rider route, proves a feasible schedule for each recommended candidate, works in both search directions, explains why one rider ranks ahead of another, and refuses a combined route that violates existing commitments. A polished map plus a proximity score alone does not satisfy that behavior.

## 19. Sources and reading order

Suggested reading order: S2 for meeting-point/time-window reasoning; S19–S21 for TypeScript architecture; S9 for routing data; S5–S6 for insertion; S7/S16/S17 when considering global assignment. S1 gives broader terminology and S4 explains tolerance tradeoffs.

### Research papers

- **S1.** Agatz, N., Erera, A., Savelsbergh, M., Wang, X. (2012). *Optimization for dynamic ride-sharing: A review*. European Journal of Operational Research 223(2), 295–303. [Institutional record](https://repub.eur.nl/pub/34909/). [DOI](https://doi.org/10.1016/j.ejor.2012.05.028).
- **S2.** Stiglic, M., Agatz, N., Savelsbergh, M., Gradisar, M. (2015). *The benefits of meeting points in ride-sharing systems*. Transportation Research Part B 82, 36–53. [Published-paper record](https://repub.eur.nl/pub/82084/). [Full research-report PDF](https://repub.eur.nl/pub/77595/ERS-2015-003-LIS.pdf). [DOI](https://doi.org/10.1016/j.trb.2015.07.025).
- **S3.** Mallus, M., Colistra, G., Atzori, L., Murroni, M., Pilloni, V. (2017). *Dynamic Carpooling in Urban Areas: Design and Experimentation with a Multi-Objective Route Matching Algorithm*. Sustainability 9(2), 254. [Publisher](https://www.mdpi.com/2071-1050/9/2/254). [Institutional record](https://iris.unica.it/handle/11584/215801).
- **S4.** Ouyang, Y., Yang, H., Daganzo, C. F. (2021). *Performance of reservation-based carpooling services under detour and waiting time restrictions*. Transportation Research Part B 150, 370–385. [Institutional record](https://its.berkeley.edu/publications/performance-reservation-based-carpooling-services-under-detour-and-waiting-time). [Publisher](https://www.sciencedirect.com/science/article/pii/S0191261521001181). [DOI](https://doi.org/10.1016/j.trb.2021.06.007).
- **S5.** Haferkamp, J., Ehmke, J. F. (2020). *An Efficient Insertion Heuristic for On-Demand Ridesharing Services*. Transportation Research Procedia 47, 107–114. [Publisher](https://www.sciencedirect.com/science/article/pii/S2352146520302611). [Institutional record](https://ucrisportal.univie.ac.at/en/publications/an-efficient-insertion-heuristic-for-on-demand-ridesharing-servic/). [DOI](https://doi.org/10.1016/j.trpro.2020.03.074).
- **S6.** Gong, Z., Zeng, Y., Chen, L. (2023). *A Fast Insertion Operator for Ridesharing over Time-Dependent Road Networks*. [arXiv record](https://arxiv.org/abs/2303.03614). [PDF](https://arxiv.org/pdf/2303.03614).
- **S7.** Alonso-Mora, J., Samaranayake, S., Wallar, A., Frazzoli, E., Rus, D. (2017). *On-demand high-capacity ride-sharing via dynamic trip-vehicle assignment*. PNAS 114(3), 462–467. [MIT record](https://dspace.mit.edu/entities/publication/74fadcc0-7237-4d8d-8d08-869b75274805). [DOI](https://doi.org/10.1073/pnas.1611675114).
- **S8.** *Multi-Objective Planning of Commuter Carpooling under Time-Varying Road Network* (2024). Sustainability 16(2), 647. [Publisher](https://www.mdpi.com/2071-1050/16/2/647). Identified as additional reading; detailed experimental claims were not used to choose this project's defaults.

### Official documentation and code

- **S9.** OSRM official [HTTP API documentation](https://project-osrm.org/docs/v26.5.0/http): Route, Table, Match, directed coordinates, null/unreachable matrix values, and units. [Repository](https://github.com/Project-OSRM/osrm-backend).
- **S10.** OSRM [API usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) and [repository README](https://github.com/Project-OSRM/osrm-backend).
- **S11.** Google Routes API: [Get a route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix). Consult the current limits for the chosen traffic mode.
- **S12.** Google Routes API: [Compute Routes reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [intermediate waypoints](https://developers.google.com/maps/documentation/routes/intermed_waypoints), and [waypoint-order optimization](https://developers.google.com/maps/documentation/routes/opt-way).
- **S13.** Google OR-Tools: [vehicle routing](https://developers.google.com/optimization/routing), [time windows](https://developers.google.com/optimization/routing/vrptw), and [pickup/delivery](https://developers.google.com/optimization/routing/pickup_delivery).
- **S14.** Firebase official [geohash geo-query guide](https://firebase.google.com/docs/firestore/solutions/geoqueries).
- **S15.** Firebase official [transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions).
- **S16.** [Leot6/AMoD2](https://github.com/Leot6/AMoD2): C++ simulator with greedy insertion, batch assignment, and schedule-pool assignment.
- **S17.** [DMadhuranga/rtv-dispatch](https://github.com/DMadhuranga/rtv-dispatch): time-window pickup/delivery solver with insertion fallback and RTV assignment.
- **S18.** Mobicoop matcher [README](https://git.coopgo.io/ncaron/matcher/src/branch/next-release/README.md), mirrored from [upstream](https://gitlab.com/mobicoop/v3/service/matcher).
- **S19.** Mobicoop [passenger-oriented algorithm](https://git.coopgo.io/ncaron/matcher/src/branch/next-release/src/modules/ad/core/application/queries/match/passenger-oriented-algorithm.ts).
- **S20.** Mobicoop [abstract algorithm](https://git.coopgo.io/ncaron/matcher/src/branch/next-release/src/modules/ad/core/application/queries/match/algorithm.abstract.ts).
- **S21.** Mobicoop [match query handler](https://git.coopgo.io/ncaron/matcher/src/branch/next-release/src/modules/ad/core/application/queries/match/match.query-handler.ts).

### Evidence boundaries

The proposal combines inspected papers/abstracts, official routing/database documentation, selected source files, and the supplied project breakdown. Some publisher PDFs were blocked; those entries are labeled with what was accessible. It is not a benchmark of the repositories, an audit of current Seawolf Rides code, or a claim to reproduce Uber's proprietary production algorithm. Formulas, weights, starting thresholds, code contracts, rollout sequence, and validation scenarios are project-specific design proposals. No app code was changed by this research.
