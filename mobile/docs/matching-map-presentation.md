# Matching and Map presentation guide

This guide covers the existing main-Map Friday test and the existing **Three cars / seven riders** presentation. Both use synthetic people and local in-memory state. Neither flow is backend authorization, persistent storage, or a cross-device transaction.

## Main Map Friday walkthrough

1. Sign in with a driver commute that includes Friday, then open **Map**.
2. Expand **Developer tools** and choose **Load Friday driver test**. Loading evaluates and creates three dated pending requests for Ava, Ben, and Chloe; it does not accept them.
3. Confirm that the Map shows three maroon privacy areas labeled **Approximate area — pickup shared after acceptance.** No exact pickup participates in a route yet.
4. Open **Home → Requests**, accept Ava, await the completed checking result, and return to Map. Ava is now a green confirmed pickup while Ben and Chloe remain approximate.
5. Accept Ben the same way. Ben consumes two passenger seats but remains one rider, one request, and one pickup stop. The Map now shows exact accepted pickups for Ava and Ben; Chloe remains approximate.
6. On Map, calculate the pickup route. Only Ava and Ben are sent as stops, in the accepted combined plan's order. Resetting the Friday test removes its requests, markers, plan, and route work without changing the three-car demo.

The Friday loader uses live OSRM evaluation. Provider failures remain visible and do not fall back to deterministic estimates.

## Two-minute three-car walkthrough

1. Open **Map → Carpool Matching Demo → Three cars / seven riders**. The live scenario is the primary card; older deterministic cases are under **Developer scenarios**.
2. Choose **Load demo data**. Point out the three synthetic drivers, seven synthetic rider intents, stable letter pins, Tabler destination, and zero accepted memberships. No route or ranking exists yet.
3. Choose **Find matches**. Live OSRM supplies shared directed road estimates. The complete-group evaluator searches permitted pickup orders, and the recommendation engine displays the calculated feasible rankings and genuine infeasible/unknown explanations.
4. Select Jordan — Queens, Morgan, or Taylor, then select a ranked rider. The dashed proposed route geometry is requested lazily for the complete proposed group. The gray line is the selected driver's solo baseline.
5. Choose **Accept simulated test request** and wait for **Checking acceptance…** to finish. Acceptance revalidates the entire occupied group before committing membership and its combined plan together. Accepted routes use the owning car's color.
6. Switch cars to show that capacity is scoped to each car while a rider accepted elsewhere is unavailable across all three cars for that occurrence. Ben requests two seats but remains one pickup.
7. Use **Remove from test car** to demonstrate exact-membership cancellation and recomputation of the remaining immutable promises.

Live mode never substitutes schematic geometry. The deterministic fixture remains available under **Mode, date, and technical details** for reproducible regression demonstrations and is prominently labeled **Schematic — not a road route.**

## Predefined inputs and calculated results

Predefined:

- Synthetic participant/profile identities and public station routing points.
- Driver occurrences, capacities, date, direction, timezone, departure/arrival windows, preferences, and detour limits.
- Rider seat quantities, pickup/destination windows, walking/service assumptions, and ride-time limits.
- The common confirmed Tabler destination.
- A separate deterministic directed matrix used only by developer fixture mode and automated tests.

Calculated at runtime in live mode:

- Directed road durations and distances, provider availability, and selected road geometry.
- Complete-group feasibility, waiting and service schedule, permitted pickup order, and departure interval.
- Incremental and total driver elapsed time, ranking, and rejection/unknown explanations.
- Acceptance revalidation and the replacement combined plan after cancellation.

Loading inputs alone creates no accepted membership, route plan, ranking, or automatic assignment. A recommendation does not reserve a seat.

## Current limitations and outstanding checks

- State and compare-and-swap revisions are local to this running app. There is no backend authorization, persistence, multi-device locking, or cross-device atomicity.
- OSRM estimates are static road estimates without live traffic. Network/provider failures remain unknown or unavailable.
- The Map route preview is not production navigation or background guidance.
- Android JavaScript/Hermes export is part of automated handoff verification, but it is not a native Gradle build or device test.
- Pin centering, clipping, callout behavior, Back handling, and camera restoration still require hands-on checks on physical iOS and Android devices. Record device models and OS versions when those checks are performed.
