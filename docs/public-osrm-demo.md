# Limited public OSRM demonstration

This profile is for the two-account M3 demonstration, not an unrestricted service. The [OSRM demo policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) limits requests to one per second and provides no uptime/latency guarantee.

## One shared outbound path

Set `OSRM_BASE_URL=https://router.project-osrm.org` in the target function environment. `findCompatibleDrivers` handles matching and `{ action: 'PREVIEW', revision }` map previews. The mobile app never directly calls the public router. Server requests identify the application and repository in their User-Agent; the results screen attributes OSRM and OpenStreetMap and links to map corrections. Other mobile development routes fail with a configuration message instead of bypassing the scheduler; a custom non-public provider requires its own approved configuration.

A Firestore transaction on `_m3Routing/publicOsrm` admits exactly one routing operation across concurrent invocations, instances and overlapping deployment revisions. Busy callers receive `resource-exhausted` immediately and can retry. Maximum function instances is one and concurrency is four so overlapping requests can promptly receive a busy response; the distributed transaction is the actual cross-instance guard.

Inside the admitted operation, concurrent candidate route calls are queued serially. The next upstream request starts at least 1,100 ms after the preceding request completes, including failed requests. Before releasing ownership, all queued work is drained; releasing records a further server-time cooldown. Firestore read timestamps arbitrate admission/cooldown so separate hosts do not rely on synchronized local clocks. Routing never runs inside a transaction callback that Firestore may retry.

A successful route is cached for ten minutes in the private `_m3RouteCache` collection, keyed by endpoint and ordered public coordinates. Duplicate candidate routes and later previews reuse it. Oversized route results are not persisted. Both control/cache collections are denied to all mobile clients by the existing default-deny rules. They contain public routing data only.

## Bounded work and crash behavior

- At most **two candidate setups** per matching request; the response discloses this limit and truncation.
- At most **four uncached provider requests** per admitted operation; previews use one.
- Upstream request timeout: **10 seconds**. Routing budget: **55 seconds**, with a full upstream-timeout allowance required before each new dispatch.
- Function timeout: **120 seconds**. There is no unbounded cross-invocation waiter queue.
- Mobile previews and searches use the same admission/cooldown/cache path. Cancelling a screen ignores stale responses; it does not create a separate direct routing path.

**The owner does not expire automatically.** A time-based takeover could race a delayed/frozen worker that later resumes its HTTP call. If a process dies before releasing, the demo deliberately remains unavailable instead of risking overlapping provider traffic. This is an operational tradeoff for a small demonstration. Do not add a TTL or casually clear an occupied owner: an operator must first establish that its old worker/revision has terminated. Inspect function logs and `_m3Routing/publicOsrm`; terminate the old revision before manually resetting a genuinely abandoned owner. Normal errors drain/release automatically. No automatic repair deletes deployed resources.

## Verification

Backend unit tests cover concurrent candidate calls, independent admission attempts, completion-to-next-start spacing, cross-owner cooldown, duplicate-route caching, failed callback draining, failed provider requests, and exhausted request/time budgets. Callable emulator tests use the real Firestore transaction implementation to verify atomic ownership, non-expiring crashed owners, cooldown, and private state access. The local fake OSRM server records arrival times and verifies spacing across searches and previews. Tests never load-test the public endpoint.

Deployment must preserve unrelated functions, indexes and rules. Deploy only the named function and reviewed Firestore configuration after comparing the existing remote resources. A successful build/CI run does not prove cloud deployment or the two-account device test.
