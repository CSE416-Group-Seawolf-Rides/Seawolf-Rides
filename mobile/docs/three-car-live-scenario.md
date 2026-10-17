# Three-car live scenario inputs

The primary “Three cars / seven riders” presentation is a live-routing scenario. It stores people, confirmed public points, schedules, capacities, walking/service assumptions, and detour constraints only. Travel durations, pickup orders, feasibility, rankings, road geometry, and assignments are never fixture inputs; the shared OSRM source and existing group evaluator calculate them at runtime.

The older directed matrix remains available as **Developer deterministic fixture** for automated regression tests and an explicitly schematic presentation. It is not a fallback for live failures.

## Coordinate source

Station coordinates are copied from the Metropolitan Transportation Authority’s LIRR GTFS static feed, `stops.txt`, retrieved October 16, 2026:

- MTA feed: <https://web.mta.info/developers/data/lirr/google_transit.zip>
- New York State catalog description: <https://data.ny.gov/Transportation/MTA-General-Transit-Feed-Specification-GTFS-Stati/fgm6-ccue>

| Badge | Person | MTA stop ID | GTFS stop name | Latitude | Longitude |
|---|---|---:|---|---:|---:|
| J | Jordan | 102 | Jamaica | 40.69960817 | -73.80852987 |
| M | Morgan | 132 | Mineola | 40.74034743 | -73.64086293 |
| T | Taylor | 179 | Ronkonkoma | 40.80808613 | -73.10594023 |
| A | Ava | 84 | Hempstead | 40.71329663 | -73.62503239 |
| B | Ben | 92 | Hicksville | 40.76717491 | -73.52853322 |
| C | Chloe | 91 | Huntington | 40.85300971 | -73.40952576 |
| D | Diego | 44 | Deer Park | 40.76948364 | -73.29356494 |
| E | Emi | 29 | Brentwood | 40.78083474 | -73.24361074 |
| F | Finn | 14 | Stony Brook | 40.92032252 | -73.12854943 |
| G | Grace | 202 | Smithtown | 40.85654755 | -73.19803235 |

The common destination continues to use the app’s canonical confirmed Tabler point from `campusDestinations.ts`.

## Constraints

- Capacities: Jordan 3, Morgan 3, Taylor 2 passenger seats.
- Driver departure windows: one hour each; campus arrival 08:00–09:30.
- Every rider pickup window: 07:30–09:00; destination arrival 08:00–09:45.
- Ben requests two seats; every other rider requests one.
- Access and egress assumptions: 5 minutes each, with 10-minute limits.
- Pickup service: exactly 120 seconds per rider request stop.
- Rider extra in-vehicle limit: 30 minutes.
- Driver total added elapsed limit: 15 minutes. No percentage limit is set, so a ratio cap cannot silently make the absolute limit smaller.

These windows are predefined inputs, not promised outcomes. Live provider failures and genuine infeasibility remain visible.

See [matching-map-presentation.md](./matching-map-presentation.md) for the Friday and three-car presentation walkthroughs, the predefined-versus-calculated boundary, and current QA limitations.
