# Routing Provider Comparison for Milestone 3

**Status:** Proposed decision for team review

**Last reviewed:** October 6, 2026

**Scope:** Milestone 3 route estimation and explainable driver-rider matching

## 1. Decision to Make

Seawolf Rides needs a routing provider to estimate:

- the driver's direct trip duration;
- the trip duration when the driver picks up a rider;
- the added pickup detour; and
- whether that detour is acceptable for the driver's schedule and preference.

The map shown in the mobile app and the routing provider do not have to be the same product. For example, the app may display a map through `react-native-maps` while trusted backend logic requests route estimates from Mapbox. Keeping those responsibilities separate avoids coupling the matching engine to one vendor and avoids rewriting the map UI solely to change routing providers.

## 2. M3 Requirements

The provider selected for M3 should offer:

1. Reliable driving routes and travel-duration estimates in the United States.
2. Intermediate waypoints so a route can be evaluated through a rider pickup.
3. Historical or scheduled-departure traffic estimates for recurring commutes.
4. Live traffic as a useful enhancement, but not a requirement for the M3 MVP.
5. Enough free usage for development, automated testing, and a class demonstration.
6. A server-side API that can be hidden behind the provider-independent routing adapter.
7. Clear failure behavior, usage limits, attribution requirements, and pricing.

Live traffic alone should not determine the choice. A recurring Monday 8:00 AM commute is better evaluated using typical traffic for Monday at 8:00 AM than traffic at the instant a developer runs the demo. Fixed test data should continue to be used in automated matching tests so results remain deterministic.

## 3. Provider Comparison

Pricing and free allowances below were checked on October 6, 2026 and may change. They should be verified again before production deployment.

| Provider | Traffic-aware routing | Relevant advanced features | Published free allowance | M3 assessment |
|---|---|---|---:|---|
| **Mapbox Directions API** | Current and historical traffic through the `driving-traffic` profile; scheduled departure estimates | Incidents, closures, congestion annotations, alternate routes, route matrix, waypoint optimization, toll/HOV avoidance, and EV routing | 100,000 Directions requests/month | Best overall M3 value; traffic-aware requests are included in ordinary Directions pricing |
| **Google Maps Platform Routes API** | Live traffic requires a Pro request; traffic-unaware routes use Essentials | Mature coverage and ecosystem; route matrices; waypoint optimization; higher tiers for toll calculation, two-wheel routing, and some detailed traffic features | 10,000 Essentials or 5,000 Pro requests/month | Trusted and capable, but traffic and optimization can move requests into more expensive SKUs |
| **TomTom Routing API** | Live and historical traffic are supported in standard routing | Traffic-delay breakdown, future departure/arrival routing, closures, alternatives, vehicle settings, eco routes, and optimization | 20,000 Routing requests/month; no credit card required to start | Strong cost-safe alternative and particularly good for explainable traffic delays |
| **HERE Routing API** | Live traffic, historical patterns, and time-aware restrictions | Route matrix, waypoint sequencing, truck restrictions, tolls, and EV routing | Limited plan advertises approximately 1,000 requests/day, subject to plan terms | Technically strong, but plan terms and pricing are less straightforward for a student MVP |
| **openrouteservice** | No comparable managed live-traffic feed | Directions, matrices, optimization, isochrones, and self-hosting | 2,000 Directions requests/day on the standard plan | Good open-source fallback when live traffic is unnecessary; weaker fit for traffic-aware commute estimates |
| **GraphHopper / self-hosted OSRM or Valhalla** | No turnkey consumer-grade live traffic by default | Custom routing rules, matrices, optimization, map matching, and self-hosting options | Varies; self-hosted software is free but infrastructure and data operation are not | Adds operational work that is not justified for M3 |

## 4. Cost at Expected M3 Scale

For one driver and three candidate riders, a simple evaluation can use one direct route plus one route through each candidate pickup:

```text
1 direct driver route + 3 pickup routes = 4 routing requests
```

At that rate:

- Mapbox's 100,000-request allowance supports approximately 25,000 matching evaluations per month.
- TomTom's 20,000-request allowance supports approximately 5,000 evaluations per month.
- Google's 10,000-request Essentials allowance supports approximately 2,500 traffic-unaware evaluations per month.
- Google's 5,000-request Pro allowance supports approximately 1,250 traffic-aware evaluations per month.

Actual usage can be reduced by filtering incompatible schedules, unavailable seats, implausible locations, and opposite travel directions before requesting routes. A matrix endpoint may reduce network round trips, but matrix billing is often based on origin-destination elements rather than HTTP request count and must be estimated separately.

## 5. Recommendation

Use the **Mapbox Directions API for the M3 routing adapter**, subject to team approval.

Mapbox is recommended because:

- traffic-aware routing is included in its ordinary Directions API rather than requiring a Google Pro SKU;
- its 100,000-request monthly free allowance provides substantial room for development and demonstrations;
- current traffic, historical traffic, closures, incidents, and congestion data can improve route explanations;
- scheduled-departure estimates fit recurring university commutes;
- route, matrix, and optimization APIs leave room for later ranking improvements; and
- it can be called from trusted backend logic without forcing the mobile map UI to use a Mapbox-specific rendering SDK.

TomTom is the preferred fallback if avoiding a billing account is more important than the larger allowance. Google remains a viable fallback if the team prioritizes its existing ecosystem and accepts the lower free allowance and Pro pricing for traffic-aware routing.

This recommendation does **not** make live traffic part of the M3 acceptance criteria. The first integration should support route duration and detour calculations through the provider-independent adapter. Historical/scheduled traffic may then be enabled without changing the matching engine's domain contract.

## 6. Integration and Security Decision

The routing provider must remain behind the existing provider-independent matching boundary:

```text
Mobile UI -> trusted application logic -> routing adapter -> routing provider
                                      -> matching engine
```

- Do not commit API tokens or embed unrestricted routing credentials in the mobile bundle.
- Restrict credentials by permitted API, origin or server environment where the provider supports it.
- Normalize provider responses into route duration, distance, geometry if needed, traffic metadata, and an explicit error state.
- Record the provider and calculation time in diagnostic metadata, without logging unnecessary exact home coordinates.
- Cache only when allowed by the provider's terms and when the result is still appropriate for the requested departure time.
- Use fixed adapter test fixtures so CI does not consume quota or depend on external availability.

## 7. Explainability Example

The matching engine should receive normalized estimates and produce a provider-neutral explanation such as:

```text
Direct driver commute:       18 minutes
Commute through Rider A:     22 minutes
Additional pickup detour:     4 minutes
Driver's maximum detour:      8 minutes
Schedule overlap:             15 minutes

Result: compatible because the schedules overlap and the 4-minute detour
is within the driver's 8-minute limit.
```

If traffic data is enabled, the UI may separately state that the estimate includes typical traffic for the scheduled departure or current traffic. A proprietary provider score should not replace the team's explainable schedule and detour rules.

## 8. Sources

- [Mapbox Directions API documentation](https://docs.mapbox.com/api/navigation/directions/)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Google Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [TomTom Routing API introduction](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/product-information/introduction)
- [TomTom pricing](https://docs.tomtom.com/pricing)
- [HERE traffic-aware routing documentation](https://docs.here.com/routing/docs/routing-v8-traffic-in-routing)
- [HERE plan limits and excluded use cases](https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases)
- [openrouteservice plans](https://openrouteservice.org/plans/)
- [GraphHopper pricing](https://www.graphhopper.com/pricing/)
- [OSRM backend](https://github.com/Project-OSRM/osrm-backend)
- [Valhalla routing engine](https://github.com/valhalla/valhalla)

## 9. Team Approval Checklist

Before implementation, the team should confirm:

- [ ] Mapbox is approved as the M3 routing provider.
- [ ] Routing requests will be made through trusted application logic.
- [ ] The map-display implementation may remain independent of the routing provider.
- [ ] Historical/scheduled traffic is preferred for recurring commute scoring.
- [ ] Live traffic is optional for M3 and will not make automated tests nondeterministic.
- [ ] Usage alerts or hard limits will be configured before connecting a billable account.
