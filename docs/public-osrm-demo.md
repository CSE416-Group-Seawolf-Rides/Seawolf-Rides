# Limited public OSRM demonstration

This profile is for the two-account M3 demonstration, not an unrestricted service. The [OSRM demo policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) limits requests to one per second and provides no uptime/latency guarantee.

## One shared outbound path

The [local demo launcher](local-m3-demo.md) sets `OSRM_BASE_URL=https://router.project-osrm.org` for the Functions emulator under `demo-seawolf-rides`. No cloud deployment or billing upgrade is required. Hosting the backend locally does not exempt external routing requests from the provider policy. `findCompatibleDrivers` handles matching and `{ action: 'PREVIEW', revision }` map previews. The mobile app never directly calls the public router. Server requests identify the application and repository in their User-Agent; the results screen attributes OSRM and OpenStreetMap and links to map corrections. Other mobile development routes fail with a configuration message instead of bypassing the scheduler; a custom non-public provider requires its own approved configuration.

A Firestore transaction on `_m3Routing/publicOsrm` admits exactly one routing operation across concurrent invocations, instances and overlapping deployment revisions. Callers that observe occupied ownership or cooldown receive `resource-exhausted` and can retry, without joining a routing wait queue. Firestore admission itself can incur transaction/SDK latency. The declared cloud instance/concurrency settings do not control the local emulator; the shared transaction is the cross-worker guard in the local demo as well. Do not start independent backend/Firestore stacks against the public router: separate databases cannot coordinate this gate.

Inside the admitted operation, concurrent candidate route calls are queued serially. The next upstream request starts at least 1,100 ms after the preceding request completes, including failed requests. Before releasing ownership, all queued work is drained; releasing records a further server-time cooldown. Firestore read timestamps arbitrate admission/cooldown so separate hosts do not rely on synchronized local clocks. Routing never runs inside a transaction callback that Firestore may retry.

A successful route is cached for ten minutes in the private `_m3RouteCache` collection, keyed by endpoint and ordered public coordinates. Duplicate candidate routes and later previews reuse it. Oversized route results are not persisted. Both control/cache collections are denied to all mobile clients by the existing default-deny rules. They contain public routing data only.

## Bounded work and crash behavior

- At most **two candidate setups** per matching request; the response discloses this limit and truncation.
- At most **four uncached provider requests** per admitted operation; previews use one.
- Upstream request timeout: **10 seconds**. Routing budget: **55 seconds**, with a full upstream-timeout allowance required before each new dispatch.
- Declared function timeout: **120 seconds**; local emulation can differ from hosted timeout enforcement. The routing budget applies independently. There is no unbounded cross-invocation routing waiter queue.
- Mobile previews and searches use the same admission/cooldown/cache path. Cancelling a screen ignores stale responses; it does not create a separate direct routing path.

**The owner does not expire automatically.** A time-based takeover could race a delayed/frozen worker that later resumes its HTTP call. If a process dies before releasing, the demo deliberately remains unavailable instead of risking overlapping provider traffic. This is an operational tradeoff for a small demonstration. Do not add a TTL or casually clear an occupied owner: an operator must first establish that its old worker/revision has terminated. For this local demonstration, follow the [emulator-only recovery procedure](local-m3-demo.md#abandoned-scheduler-recovery-emulator-only): stop all old workers, restart only Auth/Firestore with the export, reset the single gate using the guarded loopback script, export, then restart the complete backend. Normal errors drain/release automatically. No automatic repair deletes deployed resources.

## Verification

Backend unit tests cover concurrent candidate calls, independent admission attempts, completion-to-next-start spacing, cross-owner cooldown, duplicate-route caching, failed callback draining, failed provider requests, and exhausted request/time budgets. Callable emulator tests use the real Firestore transaction implementation to verify atomic ownership, non-expiring crashed owners, cooldown, and private state access. The local fake OSRM server records arrival times and verifies spacing across searches and previews. Tests never load-test the public endpoint.

The local demonstration does not deploy functions, indexes or rules to the cloud. A successful build, mocked integration suite or live backend smoke does not prove two-account physical-device behavior. The live smoke and manual acceptance must be reported separately.
