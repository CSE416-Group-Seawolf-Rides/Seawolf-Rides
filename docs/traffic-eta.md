# Departure-aware traffic forecasts (local M3 demo)

This is a follow-up to PR #15. While #15 is open, review this PR against `codex/commute-calendar-private-locations`; merge #15 first, then rebase/retarget this branch onto `main`. It adds optional traffic forecasts to onboarding departure suggestions and saved-calendar matching. Firebase remains entirely local under `demo-seawolf-rides`; no cloud deployment, billing, Storage or native navigation SDK is introduced.

## What changes

The OSRM demo uses road-profile travel durations. It does not supply live traffic to this app. Adding a blanket rush-hour multiplier would not make those durations measured traffic.

The optional provider is TomTom Calculate Route v1. Its [routing documentation](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route) supports a dated `departAt`, traffic information and typical speeds for that weekday/time. Scheduled trips are labeled **traffic-aware forecasts**, not observed future traffic or guaranteed arrival times. A near-term estimate may benefit from available current conditions, but the UI does not promise live traffic coverage. The provider receives the private coordinates, as described during setup.

For each candidate, use the same canonical evaluator with three protected requests:

1. Driver → campus at the saved departure, for the solo baseline.
2. Driver → pickup at that same departure.
3. Pickup → campus at departure + evaluated drive-to-pickup seconds + the existing 120-second boarding allowance.

Boarding is included once in the canonical plan. The second driving leg uses its own appropriate departure time; another date or departure cannot reuse the first forecast. Units remain seconds/meters. Arrival ±30-minute rules, seat/readiness/role checks, private point validation, UNKNOWN versus incompatible results and deterministic ranking stay in place.

Traffic mode evaluates **one arrangement per backend page**, with at most three uncached route requests; OSRM keeps two arrangements/four requests. Display pages of 1/2/5/10 people are separate from these bounded routing batches. The existing cross-invocation Firestore guard, spacing, timeout, budget and abandoned-owner lock behavior remain shared across traffic matching, onboarding suggestions and legacy previews. No automatic retries, lease takeover or direct mobile provider requests are added.

## Accuracy, freshness and safeguards

- Use the exact saved New York date/time converted to UTC, including daylight saving changes. Do not request traffic for “now” to represent a future commute.
- Validate finite nonnegative timings (including provider-confirmed zero travel at coincident points), leg totals, returned departure/arrival context and road geometry endpoints within 75 meters of selected points. Provider errors, missing configuration, quota exhaustion and malformed data produce UNKNOWN/unavailable results, never a fabricated static traffic estimate.
- Cache successful forecasts for at most two minutes, keyed by provider, exact ordered coordinates, and an explicitly distinguished dated departure or arrival. Static OSRM's existing cache behavior is retained.
- Return only a small `eta` evidence record with each calendar match: model (`TRAFFIC_FORECAST`/`STATIC_ROAD`), provider, computation timestamp and driver departure timestamp. Do not return road geometry, another participant's exact coordinates, API keys or raw provider error bodies.
- Match cards identify traffic forecasts. Details show provider/source and estimate time. Forecasts older than two minutes require Refresh estimates before a new rider request; refreshing is an explicit action, not polling.
- The backend shares a configurable **monthly** limit of uncached TomTom attempts (default **18,000**, reserving 2,000 of the advertised allowance; `TOMTOM_MONTHLY_REQUEST_LIMIT` accepts 1–20,000) in `_m3Routing/tomtomBudget`, using UTC calendar months, Firestore read time and transactions. Failed attempts consume quota; cache hits do not. Export/import preserves the counter. This covers clients and invocations using the same emulator dataset, not other applications/datasets using the same account or key. The TomTom dashboard is authoritative for account-wide usage. Starting a fresh dataset does not preserve this budget. A legacy daily counter carries its recorded count into the current month; unrecorded earlier usage cannot be reconstructed.
- The shared scheduler keeps its existing four-request/55-second operation bound, ten-second provider timeout and 1.1-second spacing. No request may silently bypass it. The API key stays in the local backend environment; requests reject redirects and arbitrary remote endpoints. A loopback-only test endpoint is available solely inside the demo emulator.

Recommendations remain informational. Creation and acceptance revalidate the forecast and retain the existing requirement that proposed timing not change silently. An expired or changed forecast can reject a stale request/acceptance. There is no automatic accepted-ride rescheduling, traffic polling or new amendment flow. Avoid changing providers during a pending demonstration; refreshing/reproposing already-persisted pending requests remains follow-up work. Already accepted records retain their agreed snapshots.

Onboarding uses the same selected provider: traffic mode requests TomTom `arriveAt` for each selected weekday's next occurrence **after today**, at that day's preferred New York campus arrival. It sends `arriveAt` alone, validates the provider's returned arrival/departure and uses the resulting direct-trip duration to suggest an editable departure, rounded earlier to five minutes. Each card shows its own duration and forecast date. AM and PM arrivals have separate cache entries and can have different durations; different durations are not guaranteed for every route. Times requiring a previous-day departure, DST folds/gaps or unavailable routing remain manual. A weekly suggestion is not a forecast for every future occurrence of that weekday.

The client requests at most seven selected days sequentially, one bounded invocation/request per day, with a cooldown between days. It never retries failures automatically, never polls and stops submitting further days after a failure or leaving the step. Editing a departure does not request traffic or overwrite the chosen time. An explicit Retry travel estimates refreshes the suggestions. Choosing Use suggested times applies only available valid suggestions; the user can continue with manual times. No partner pickup detour is included until matching.

`--live-osrm` retains static onboarding suggestions, clearly labeled as excluding traffic. The older explicit matching/preview API also retains its labeled static baseline. Live ETA refresh for accepted rides remains later work.

## Free account and local activation

As checked October 18, 2026, [TomTom pricing](https://docs.tomtom.com/pricing) lists a free Routing API allowance of 20,000 monthly requests and no credit card needed. Use the free evaluation account; do not add a payment method, buy credits or enable paid usage. The application's dataset-local monthly budget is separate from the provider's account allowance and can be lowered when teammates use separate backends sharing an account. Set `export TOMTOM_MONTHLY_REQUEST_LIMIT=5000`, for example, before launching; an invalid value fails before startup. Free-account availability/entitlements must be confirmed in your dashboard.

1. Open [My TomTom](https://my.tomtom.com/), create/sign into a free developer account and create a key authorized for Routing API v1 (TomTom Maps). See [API key management](https://docs.tomtom.com/platform/documentation/my-tomtom/api-key-management). Account/key creation is a user action; no account was registered by this PR.
2. Keep the key out of chat, Git, mobile `.env` and any `EXPO_PUBLIC_*` setting. In your **backend terminal**, read it without echoing or storing it in shell history:

   ```zsh
   read -rs 'TOMTOM_API_KEY?TomTom Routing API key: '
   echo
   export TOMTOM_API_KEY
   ```

3. Stop the existing backend with one Ctrl-C and wait for its export/shutdown. Preserve its data. After checking out this branch in the checkout containing your demo export, install dependencies/build as usual and run:

   ```bash
   node scripts/start-local-demo.mjs --traffic-eta
   ```

   The launcher builds Functions, creates a mode-0600 ignored `functions/.env.local` exclusively, imports the existing `.local-demo-data`, and removes only the environment file it created on normal shutdown. It refuses an existing environment file and does not overwrite it. Recover an abandoned environment/guard using the existing [local demo procedure](local-m3-demo.md), after stopping the old worker. Never delete demo data or clear a live worker's scheduler ownership.

4. Start Expo in another terminal using the same Mac LAN IP for both clients:

   ```bash
   cd mobile
   node scripts/start-local-demo.mjs "$(ipconfig getifaddr en0)"
   ```

5. Use two verified emulator accounts with opted-in, compatible saved commutes to the same campus drop-off on a future weekday, for example Monday October 26, 2026. Select editable departure/readiness values that produce arrivals within both preferred ±30-minute windows. Search once and inspect View more: the source should be Traffic-aware forecast · TomTom, with computation/departure times. Request and accept promptly on the other client, confirm the unchanged displayed plan and accepted status on both, then verify export/import persistence. This remains a device walkthrough to perform.

`--live-osrm` continues to run the original no-key static demo. Selecting traffic without a valid backend key fails closed. Switching providers changes the search revision and invalidates old paging cursors. Do not copy local `.env.local` or demo exports into a fresh worktree automatically; keep the original export and copy it only after stopping the original worker and only into an empty destination.

## Automated verification

Unit tests mock the provider's actual HTTP contract, including dated requests, finite timing validation, snapping, malformed responses, auth/quota/network errors, cancellation/timeouts, arrival/departure-keyed cache separation, monthly rollover/configuration/legacy counters and credential-safe failures. Launcher tests verify missing-key behavior, build ordering, cleanup and preservation of an existing environment file. Calendar tests verify the three timed legs and daylight saving conversion.

`npm run test:matching` first runs the existing static-router/request/calendar suite and restart/import verification, then a fresh traffic-mode emulator suite against a loopback fake TomTom endpoint and its own restart/import verification. The traffic suite uses real Auth/Firestore participants and tests one-candidate paging, rider/driver shared cache, dated cache separation, opt-out, request/acceptance/private reads, expired cache/provider failure, arrival-based onboarding (morning versus evening, shared cache, search-gate exclusion, authentication, malformed inputs and failures), the persisted monthly quota and participant-visible acceptance after restart. CI includes this suite; stacked PR checks target the calendar branch as well as main.

Stop the manual emulator suite before running the standard test commands because they use its normal ports. During development these tests can be copied to isolated ports/configuration with a disposable Functions bundle; never overwrite a developer's environment or import their demo data into an automated test.

No real TomTom key, live provider comparison or physical-device test is implied by mocked tests. A key and minimal live smoke are still required before claiming actual traffic-provider activation or improved real-world accuracy. The code uses the provider forecast rather than asserting an empirically measured accuracy gain.
