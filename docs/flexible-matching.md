# Flexible commute matching

Saved arrival times are preferences, not class deadlines. Each participant allows
up to **45 minutes before or after** their saved campus arrival. A 9:00 AM
preference therefore permits an estimated arrival from 8:15 to 9:45 AM, inclusive.
The proposal and its shift from the searching commuter’s preference are displayed
before requesting. Users still review and accept a specific trip agreement.

## Shared timing

Discovery checks for intersecting windows. Two preferences may be up to 90 minutes
apart because each person allows 45 minutes. This is not permission for either
person’s proposed arrival to move by 90 minutes. For 9:00 and 10:00 preferences,
the shared window is 9:15–9:45; the initial proposal aims for 9:27, three minutes
before their midpoint. With identical preferences the existing three-minute buffer
is retained. The algorithm clamps this target to the intersection, rather than
aiming at the latest permissible arrival.

Rider pickup readiness, the current time, the local date and any saved return
remain bounds. Pickup driving and boarding time must fit. Missing or malformed
routes, incompatible roles, no remaining seats, blocked accounts and unverified
accounts do not become matches just because timing is more flexible. Return trips
use the intersection of the same ±45-minute preference windows around the saved
campus departure, with a midpoint proposal.

The persisted field remains `arriveBy` for compatibility. New UI copy calls it a
preferred arrival. Saved schedules and already accepted ride records are not
rewritten. Existing pending requests still revalidate their agreed plan; a proposal
whose timing changed needs a fresh search and review.

## Ranking

All evaluated matches use one deterministic cost, including after loading more
pages and grouping Either-role arrangements. Lower cost is better:

```
2 × absolute shift from your preferred time
+ absolute shift from the other commuter’s preferred time
+ added driving time
+ the rider’s extra time in the vehicle
```

All values are seconds. This gives the searching commuter’s timing extra weight
without letting a one-second advantage automatically beat a long detour. There is
no unsupported rating, distance-only proxy or arrival guarantee in the score.
Equal costs prefer the rider’s requested campus stop (Any matches all stops), then
the smaller personal time shift, less added driving, and stable participant IDs.
Unknown routing results are never assigned a rank. Only checked matches are ranked;
an incomplete search does not claim to have found the global best match. Loading
more pages re-sorts all checked results. The result sheet explains the ranking and
displays early/late shifts in ordinary minutes.

Search fingerprints use `flex45-balanced-ranking-v4` to reject paging cursors from
the previous policy. API response version 4 prevents the new client from silently
using an older backend with different timing rules. Preference and signed-offset
fields remain optional for older persisted data.

## Traffic-provider rounding

The TomTom arrival-based seed allows up to **60 seconds** of difference from the
requested `arriveAt`, in both the provider parser and calendar evaluator. This is
separate from commute flexibility. Actual provider departure and duration are
retained; they are not replaced with the requested arrival time. Final timed legs
still validate their requested departure, finite totals, future context, routing
anchors and traffic evidence. Larger arrival discrepancies are rejected.

Regression coverage includes the observed two-second-early provider response,
the ±60/61-second provider boundary, midpoint proposals, the 90-minute shared-window
boundary, readiness/date/return limits, ranking tradeoffs and page merging. Callable
integration checks use disposable emulator ports and fake routing providers.
