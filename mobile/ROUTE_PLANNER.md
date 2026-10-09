# Development Route Planner

The development-only Route Planner uses the OSRM Route service through
`src/routing/osrmAdapter.ts`. It sends an ordered list of coordinates with the
`driving` profile and requests full GeoJSON geometry. The screen currently
supplies exactly two coordinates; the adapter also supports future ordered
routes such as start → pickup → destination.

## Configuration

`EXPO_PUBLIC_OSRM_BASE_URL` selects the OSRM server. When it is unset, the
development tool defaults to `https://router.project-osrm.org`. The base URL is
public configuration embedded in the app and must not contain credentials.

The default endpoint is the Project OSRM public demo server. It is appropriate
for light manual development testing only: availability, rate limits, road-data
freshness, and continued access are not application guarantees. A production
deployment must select and operate or contract an appropriate provider and
review its terms and capacity.

OSRM estimates road-network travel time, not live traffic or a prediction for a
particular departure time. Input points can be snapped to routable road
segments. The adapter preserves both input and provider-snapped waypoints,
including the reported snap distance. It never substitutes a straight line
when a road route is unavailable or a response is invalid.

The planner holds points and results only in component state. It does not read
the saved commute privacy area, request GPS permission, or persist locations.
