# Seawolf Rides — Milestone 2 Design

## 1. Purpose and Scope

This document translates the [Milestone 1 proposal and requirements](requirements.md) into a technical design that guides setup and implementation. It distinguishes the implemented M2 foundation and prototype from proposed M3 and semester-v1 components, responsibilities, data models, privacy constraints, risks, and decisions the team must still make.

The milestones intentionally have different scopes:

- **M2 prototype:** an implemented, runnable Expo application that proves a restricted Firestore persistence path and demonstrates the planned Match, Schedule, and Chats experience with clearly isolated local fixtures.
- **M3 MVP:** authentication, driver and rider commute creation, route and schedule compatibility, one displayed match result, and persistent relevant data.
- **Core semester v1:** the M3 path plus ranked recommendations, ride requests, accept/reject/cancel behavior, basic messaging, and the complete planned carpool workflow.

Stripe cost sharing and Trip Mode remain stretch features. On-the-go matching remains a major reach goal. They are not M2 or M3 requirements.

## 2. Architectural Overview

The architecture is organized around responsibilities rather than prematurely fixed deployment units. In particular, “backend/application logic” means trusted validation and business logic; the team still needs to decide whether it runs in a dedicated server, Firebase Cloud Functions or another serverless environment, or a hybrid that also permits carefully authorized direct Firebase client access.

```mermaid
flowchart TB
    User["Stony Brook commuter"]
    subgraph Client["Mobile client — Ray"]
        Mobile["React Native + Expo app\nUI, navigation, client state"]
    end
    subgraph Application["Future application and trusted logic — Gio"]
        Boundary["Backend boundary to be selected\nserver, serverless functions, or hybrid"]
        Auth["Authentication and authorization\nfuture / not implemented"]
        Requests["Commute and ride-request rules\nfuture / not implemented"]
        Messaging["Messaging authorization\nfuture / not implemented"]
    end
    subgraph Geo["Future matching and routing — Justin"]
        Matching["Deterministic matching engine\nfuture / not implemented"]
        RoutingAdapter["Routing adapter\nfuture / not implemented"]
    end
    subgraph Platform["Data and platform — Kenny"]
        Firestore[("Cloud Firestore\nM2 sample commute persistence")]
        FutureAuth["Firebase Authentication\nfuture / not implemented"]
        CI["GitHub Actions CI\nlint, type-check, test, export"]
    end
    Routing["External routing provider\nfuture / not selected"]
    User --> Mobile
    Mobile -->|"implemented restricted get\ncommutes/sample-commute-001"| Firestore
    Mobile -.->|"future sign in / verification"| Auth
    Mobile -.->|"future trusted operations"| Boundary
    Boundary -.-> Auth
    Boundary -.-> Requests
    Boundary -.-> Messaging
    Boundary -.->|"future validated product data"| Firestore
    Boundary -.->|"future match request / candidates"| Matching
    Matching -.->|"future route estimates"| RoutingAdapter
    RoutingAdapter -.->|"future geocoding and routes"| Routing
    Matching -.->|"future recommendations"| Boundary
    Auth -.->|"future identity service"| FutureAuth
    Messaging -.->|"future persistent messages"| Firestore
    CI -.->|"checks selected implementation"| Mobile
    CI -.->|"checks selected implementation"| Boundary
    classDef proposed stroke-dasharray: 5 5
    class Boundary,Auth,Requests,Messaging,Matching,RoutingAdapter,FutureAuth,Routing proposed
```

The editable source is [architecture.mmd](architecture.mmd). The solid mobile-to-Firestore path and CI component are implemented for M2; dashed components or connections represent planned or unresolved choices.

- **Mobile frontend:** the implemented Expo application provides Match, Schedule, and Chats prototype screens. Except for the saved-commute read, their search, recommendations, requests, rides, route placeholders, conversations, and locally appended messages are simulated frontend state. A future product client must not be trusted to enforce authorization or seat limits.
- **Backend/application logic:** validates requests, enforces state transitions and authorization, coordinates matching, and protects operations requiring secrets or atomic updates. Its deployment form is unresolved.
- **Authentication:** remains unimplemented. The planned responsibility is to establish identity, verify an `@stonybrook.edu` email, and supply identity claims used by authorization. Email verification would not be enrollment or safety verification.
- **Persistent data:** Cloud Firestore is selected and implemented for the M2 proof: the mobile client reads the restricted `commutes/sample-commute-001` document. The full M3 schema, writes, indexes, and persistence boundaries remain unresolved.
- **Matching engine:** applies deterministic schedule, geographic, direction, seat, detour, and ranking rules independently of the UI and behind a routing abstraction.
- **External routing provider:** supplies geocoding and route/travel-duration estimates. No provider has been selected.
- **Messaging subsystem:** the M2 screens use local fixtures and component state only. Authorization, storage, and delivery remain future work.

## 3. Technology Stack

| Technology | Purpose | Reason for selection | Decision status |
|---|---|---|---|
| React Native 0.86.3 | Cross-platform mobile framework | Supports a single mobile-first client codebase | Implemented for the M2 technical and UX prototype |
| Expo SDK 57.0.25 | React Native development and testing tooling | Reduces native setup overhead and supports the initial Expo Go workflow | Initialized with the blank TypeScript template |
| TypeScript 6.0.3 | Client and application language | Static types can keep shared entities and matching interfaces consistent | Initialized with strict checking |
| Node.js 24.21.0 LTS | Shared development and CI runtime | Pins every operating system and CI to one Expo-compatible runtime | Selected and recorded in `.nvmrc` and package engines |
| npm | Dependency and script management | Ships with Node.js and provides reproducible installs from the committed lockfile | Selected; application lockfile is maintained in `mobile/` |
| Firebase JavaScript SDK and Cloud Firestore | M2 persistent sample-commute read | Provides a managed persistence proof that works with the Expo client | Selected and implemented for the restricted M2 read; broader product schema and writes remain future work |
| Firebase Authentication | Candidate identity and Stony Brook email-verification service | Could integrate with the selected Firebase platform | Not implemented; authentication design remains open |
| Trusted server-side runtime | Protected business logic, routing credentials, and concurrency-sensitive updates | Prevents clients from bypassing critical validation and protects secrets | Required responsibility; server versus serverless unresolved |
| External routing API | Geocoding, route duration, and detour estimates | Avoids building a road-network and navigation engine | Required capability; provider unresolved |
| GitHub Actions | Automated install, lint, type-check, test, and Expo export checks | Fits the existing GitHub repository and makes pull-request checks reproducible | Implemented and successfully run on `main` |

The repository contains the Expo application, the restricted Firestore read, an interactive frontend-only product prototype, automated tests, and working CI. Authentication, trusted server-side product logic, matching, routing, and persisted ride-request or messaging workflows remain unimplemented.

## 4. Component Responsibilities

| Component | Inputs | Outputs | Responsibility and boundary | Primary owner |
|---|---|---|---|---|
| Mobile client | User input, local fixtures, and the M2 Firestore sample | Rendered screens and local prototype state | Implements the Match, Schedule, and Chats UX prototype plus real saved-commute loading states; no authoritative access decisions | Ray |
| Authentication/authorization | Credentials, verification state, user identity | Session/identity and access decisions | Authenticate accounts, require verified Stony Brook email where appropriate, and authorize protected operations | Gio, with Kenny on platform rules |
| Application logic | Authenticated commands and stored entities | Validated state changes and responses | Enforce invariants, request transitions, data validation, and orchestration; deployment mechanism remains open | Gio |
| Persistent-data layer | M2 fixed document read; future validated reads/writes | Persisted sample commute today; broader durable entities later | Firestore stores the restricted M2 sample; full schemas, indexes, rules, and safe updates remain future responsibilities | Kenny |
| Matching engine | Rider commute, candidate driver commutes, route estimates, configured rules | Explainable compatibility results and rankings | Pure deterministic filtering/scoring where possible; no UI or provider-specific logic | Justin |
| Routing adapter | Normalized origins, pickups, destinations | Normalized geocode, route, duration, and error results | Isolate provider API formats, credential handling, limits, and failures from matching rules | Justin, with Gio on backend boundary |
| Ride-request coordinator | User identity, target commutes, current capacity/status | Approved state transition or explicit error | Enforce authorization, prevent duplicates, and handle final-seat concurrency | Gio, with Kenny on transactions |
| Messaging subsystem | Authorized participants, conversation and message data | Persisted messages available to participants | Limit access to allowed users and support basic coordination | Kenny, with Gio on authorization |
| CI pipeline | Source and configuration | Install, lint, type-check, test, and export results | Runs reproducible checks on pull requests and `main`; a hosted run on `main` has succeeded | Kenny |

Ownership identifies the lead, not an isolated silo. Architecture, reviews, tests, and integration remain shared team work.

## 5. Proposed Data Model

This is the proposed full-product logical model, not an implemented full Firestore schema. The only implemented M2 persistence shape is `commutes/sample-commute-001` with `role`, `approximateArea`, `recurringDays`, and `timePreference`. Identifiers, remaining collections, indexes, retention, and broader security rules still require design.

| Entity | Important proposed fields | Relationships and notes |
|---|---|---|
| User | id; email; email verification state; display name; profile metadata; created/updated timestamps | Owns zero or more commutes. A user may potentially have both driver and rider commutes; the team must confirm this. |
| Commute | id; owner id; role (driver/rider); private origin; destination; approximate display area; recurring days; departure and/or arrival preference; flexibility; active status; timestamps | Central matching input. Exact coordinates are private; approximate area is separately displayable. Recurrence and one-time/date representation need agreement. |
| Driver settings | commute id; available seats; maximum acceptable detour | Applies only to a driver commute. Units and validation boundaries need agreement. |
| Match/recommendation | rider commute id; driver commute id; compatibility explanation; route estimate metadata; calculated detour; rank or score; evaluated timestamp | May be calculated on demand rather than stored. If stored, it can become stale after commute changes. |
| Ride request | id; rider id; rider commute id; driver id; target driver commute id; status (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`); created/updated timestamps | State transitions require authorization and duplicate/capacity safeguards. An accepted request may represent a recurring relationship or a dated ride; this is unresolved. |
| Conversation | id; participant ids; related ride request or relationship id; active status; timestamps | Access should be limited to eligible connected users. When messaging becomes available is unresolved. |
| Message | id; conversation id; sender id; body; sent timestamp | Belongs to one conversation; advanced chat features are outside core scope. |

Important modeling questions include whether campus must always be one endpoint, how time flexibility and recurring exceptions are represented, whether a recommendation should be persisted, whether accepted requests reserve seats per recurring relationship or per date, and how multiple riders affect capacity.

## 6. Matching and Geospatial Design

The proposed matching pipeline is:

1. Retrieve the relevant active rider commute and candidate driver commutes.
2. Filter candidates to overlapping days and compatible time windows.
3. Filter for plausible geographic compatibility and travel direction.
4. Request route estimates only for promising candidates.
5. Calculate each driver's additional pickup detour.
6. Reject candidates exceeding that driver's maximum acceptable detour or without available seats.
7. Rank the remaining compatible candidates using deterministic, explainable rules.
8. Return recommendations and useful compatibility explanations to the rider.

Conceptually:

```text
added_detour =
  estimated_duration(driver -> pickup -> destination)
  - estimated_duration(driver -> destination)
```

Detour is only one condition. Matching must also consider schedule compatibility, travel direction, and seat availability. The existing M1 illustration is:

```text
Direct driver commute:      72 minutes
Commute including pickup:   79 minutes
Additional detour:           7 minutes
Driver maximum detour:      10 minutes

7 <= 10, so the detour condition passes.
```

These values are illustrative, not measured routing results, and passing this condition alone does not establish a complete match.

Day, time, broad-area, and direction prefilters can eliminate unsuitable candidates before paid or rate-limited routing calls. The team must still agree on exact schedule rules, geographic prefiltering, default thresholds, and a ranking formula; this document does not invent weights or cutoff values.

The matching module should accept normalized domain inputs and a routing interface. Unit tests can supply fixed route estimates or provider failures, allowing schedule logic, detour arithmetic, tie handling, exclusions, and ranking behavior to be tested deterministically without network calls. Separate adapter tests can validate the selected provider's response mapping.

## 7. Proposed Data and API Interactions

These are interaction responsibilities, not implemented endpoint names. Some authorized reads/writes may use Firebase client SDKs directly; trusted operations need server-side validation. The final boundary depends on the architecture decision.

The implemented M2 exception is intentionally narrow: the mobile client uses the Firebase JavaScript SDK to get only `commutes/sample-commute-001`. It does not create, update, query, or delete product data. All Match recommendations, ride requests, scheduled rides, route placeholders, and Chats content are local prototype fixtures or component state.

| Interaction | Proposed flow | Validation and authorization |
|---|---|---|
| Register/authenticate | Mobile submits credentials; authentication service establishes identity and email verification state | Restrict protected product access as agreed; never treat a client-provided email flag as authoritative |
| Create/update commute | Mobile submits commute data; trusted rules validate it; data layer persists it | User may modify only owned commutes; validate role, schedule, locations, seats, and detour fields |
| Retrieve commutes | Mobile or matching operation queries only data needed for the use case | Exact origins must not be broadly readable; apply ownership and field-visibility rules |
| Request matches | Authenticated rider selects a commute; application logic retrieves candidates and invokes matching; adapter obtains needed routes | Confirm ownership and active status; keep routing credentials server-side unless the selected provider offers a safe restricted-client pattern |
| Return recommendations | Matching emits compatible results plus explanations; application logic returns privacy-filtered views | Do not expose exact residential locations or unrelated user data |
| Create ride request | Rider selects an eligible recommendation; trusted logic checks identities, status, duplicate state, and capacity | Only the rider can create/cancel their request; only the targeted driver can accept/reject; updates should be atomic where capacity is involved |
| Send/read message | Connected user accesses a conversation and posts or retrieves messages | Verify conversation membership and the required connection/request state on every operation |

The application should use typed request/domain shapes independent of storage documents. That keeps the matching module and mobile views from depending on an unapproved database layout.

## 8. Security and Privacy

Seawolf Rides handles sensitive identity and location data. The design separates:

- **Public or approximate location:** a broad area such as “Flushing, Queens” that may be shown for compatibility context.
- **Private commute location:** exact address or coordinates used for matching and routing, accessible only to authorized processing and the owner.
- **Pickup details:** a specific location shared privately after whatever accepted-connection rule the team approves.

A verified `@stonybrook.edu` address establishes control of a university-domain mailbox. It is not proof of current enrollment, identity beyond that account, driving eligibility, insurance, or a background check. Product language must not imply those assurances.

Authorization must prevent users from reading or changing other users' private commutes, ride requests, conversations, or messages. Request state transitions and final-seat reservations require trusted enforcement rather than client-only checks. Logs and analytics should avoid unnecessary exact coordinates and message content. Data retention and account deletion policies require later definition.

The six Firebase `EXPO_PUBLIC_*` values documented in `mobile/.env.example` are public client configuration embedded in the application bundle; they are not private server secrets. The local populated `mobile/.env` remains ignored. Routing API secrets, privileged Firebase credentials, and other server credentials must not be committed or embedded in a distributable mobile bundle. The M2 Firestore rules restrict the prototype read to the sample document, but broader Firebase security rules, server validation, credential restrictions, and indexes must be implemented and tested before future product flows can be called secure.

## 9. Reliability and Edge Cases

| Scenario | Required behavior | Target |
|---|---|---|
| Incompatible schedules | Exclude with an explainable result without calling routing unnecessarily | M3 |
| Opposite travel directions | Exclude even when origins are geographically close | M3 |
| Excessive detour | Exclude when the route-derived addition exceeds the driver's limit | M3 |
| No available seats | Do not recommend or accept a new request against full capacity | M3 for matching; v1 for request enforcement |
| Routing failure or timeout | Return a recoverable unavailable/error state; do not crash or fabricate compatibility | M3 |
| Missing/ambiguous geocode | Ask for correction or mark the commute unevaluable | M3 |
| Duplicate ride requests | Detect and reject or return the existing active request | Core v1 |
| Concurrent final-seat requests | Use a transaction or equivalent trusted atomic operation when accepting | Core v1 |
| Commute edited after matching | Recompute or invalidate stale recommendations before consequential actions | M3 policy; full enforcement by v1 |
| Unauthorized private-data access | Deny access at service/data-rule boundaries, not only in UI | M3 for implemented data; v1 coverage expands with features |

M3 should handle failures along its authentication, commute, matching, routing, and persistence path. Request concurrency and messaging-specific failure modes become mandatory when those core-v1 features are implemented. No latency, availability, or scale guarantee is claimed at this stage.

## 10. M2 Minimal Prototype

**Status: implemented and verified.** The technical heartbeat is a real Expo-to-Firestore read of the restricted `commutes/sample-commute-001` document. The app displays its `role`, `approximateArea`, `recurringDays`, and `timePreference` fields and handles initial, loading, success, missing-document, and recoverable-error states.

The app has also grown into a broader frontend-only UX prototype with Match, Schedule, and Chats tabs. This layer demonstrates the intended interaction model using typed local fixtures and component state: it does not perform matching, calculate routes, persist ride requests, or persist chat messages. Route visuals are placeholders, and no live traffic is presented.

Verified M2 evidence:

1. The Expo application runs and has been manually verified on a physical iPhone through Expo Go.
2. The saved-commute success path reads persisted Firestore data rather than a hard-coded component object.
3. Real initial, loading, success, missing-document, and recoverable-error states are implemented.
4. The six required public client variables are documented in `mobile/.env.example`; the populated local `.env` is ignored.
5. Automated tests cover sample-commute data-to-view/domain mapping.
6. Root scripts run lint, type-check, tests, and a non-publishing Expo export/build check.
7. GitHub Actions uses `npm ci` and those checks and has completed successfully on `main`.

This prototype proves the mobile/persistence foundation and communicates the planned UX. It does not prove authentication, real matching, routing, persistent ride requests, persistent messaging, payments, or the full M3 backend workflow.

## 11. M1 Requirements to Architecture Mapping

The labels below are descriptive traceability identifiers introduced by this M2 document; they are not original M1 requirement IDs.

| Traceability label | M1 requirement | Responsible component | Planned implementation responsibility | Milestone target |
|---|---|---|---|---|
| AUTH | Account authentication and Stony Brook email verification | Authentication and mobile client | Gio leads auth/application logic; Ray builds client flow; Kenny supports platform configuration | M3 |
| COMMUTE | Create and manage driver/rider commutes | Mobile, application logic, persistent data | Ray forms/UI; Gio validation; Kenny model/storage | M3 |
| SCHEDULE | Schedule compatibility | Matching engine | Justin defines/tests rules with team-approved product decisions | M3 |
| ROUTE | Route and travel-direction compatibility | Matching engine and routing adapter | Justin owns integration and normalized route evaluation | M3 |
| DETOUR | Additional pickup detour calculation and driver limit | Matching engine and routing adapter | Justin owns formula and tests; Gio protects trusted execution boundary | M3 |
| RANK | Ranked, explainable recommendations | Matching engine and mobile client | Justin owns deterministic ranking; Ray presents results | Core v1; basic result in M3 |
| REQUEST | Send, accept, reject, and cancel ride requests | Application logic and persistent data | Gio owns state rules; Kenny owns concurrency/storage integration; Ray owns UI | Core v1 |
| MESSAGE | Basic connected-user messaging | Messaging, data, and mobile client | Kenny leads subsystem; Gio authorization; Ray UI | Core v1 |
| PERSIST | Persistent shared data | Persistent-data layer | Kenny leads schema/platform; Gio integrates application logic | M2 prototype foundation; M3 product data |
| MOBILE | Practical mobile-first workflow | Mobile client | Ray leads, with team usability review | M3 onward |
| PRIVACY | Protect exact locations from unrelated/unmatched users | All boundaries, especially authorization and data rules | Gio and Kenny enforce; Justin minimizes matching exposure; Ray limits display | M3 onward |

## 12. Development and CI Plan

The repository contains an Expo/React Native TypeScript application in `mobile/`, npm scripts for linting, type-checking, testing, and a non-publishing Expo export, plus a GitHub Actions workflow that runs the same checks. The checks pass locally, and the hosted workflow has completed successfully on `main`.

As implementation expands beyond M2, create only the directories required by the chosen structure—for example, a backend directory only if a separate backend is selected. Keep provider-independent matching logic separated from UI and routing-adapter code. Document environment configuration without committing secrets.

Development workflow:

1. Create short-lived feature branches from an up-to-date main branch.
2. Open pull requests that connect code to a requirement or design decision.
3. Require at least one teammate review, with the component owner involved for domain-sensitive changes.
4. Run formatting/linting, unit tests, and a reproducible build or type-check locally and in CI.
5. Add focused unit tests for pure matching and validation logic; mock routing at the adapter boundary.
6. Add integration tests for authentication/data rules and the selected persistence path using safe test configuration or emulators where supported.
7. Add an end-to-end smoke test for the M3 path after the components are integrated.

The initial GitHub Actions workflow installs dependencies from `mobile/package-lock.json` and runs the repository's real lint, type-check, test, and export scripts on pull requests and pushes to `main`. It has no deployment or external-service credentials.

## 13. Open Design Decisions

| Decision | Current working direction | Alternatives | What the team must resolve |
|---|---|---|---|
| Final backend architecture | Trusted logic plus selected direct client access | Dedicated server; Firebase Cloud Functions/serverless; hybrid | Deployment unit, request boundaries, local testing, cost, and ownership |
| Firebase services beyond M2 Firestore | Firestore is selected for M2 persistence; authentication and trusted execution remain open | Firebase Authentication and Cloud Functions; another identity/server platform; hybrid | Identity service, trusted runtime, environments, emulators, broader rules, indexes, and pricing limits |
| Routing provider | External provider; M1 mentions Mapbox or similar | Mapbox, Google Maps Platform, HERE, other viable provider | Coverage, directions/geocoding features, pricing, quotas, license, mobile/server credential model |
| Schedule compatibility | Deterministic overlapping-day/time rules | Departure windows, arrival deadlines, mixed model | Time representation, time zone, flexibility semantics, inclusive boundaries |
| Geographic prefilter | Broad location and direction filter before routing | Geohash/radius, corridor/bounding box, provider matrix | Privacy-preserving inputs, false negatives, query/index support |
| Thresholds and ranking | Explainable deterministic scoring | Ordered rules, weighted score, lexicographic ranking | Defaults, user controls, tie-breaking, exact formula and tests |
| Recommendation persistence | Calculate on demand unless a use case justifies storage | Persist results with expiry/versioning | Freshness, audit/explanation needs, cost, invalidation behavior |
| Ride representation | Unresolved | Accepted recurring relationship; individual dated rides; parent relationship plus occurrences | Cancellation/exceptions, capacity, history, request semantics |
| Seat reservation | Enforce trusted capacity on acceptance | Reserve on pending request; reserve only per occurrence | Transaction boundary, overbooking behavior, release rules |
| Message authorization | Connected participants only | Access after match, request, or acceptance | Exact enabling state, conversation lifecycle, blocking/reporting expectations |
| Location visibility | Approximate before connection; specific pickup after approved state | Different precision/staged disclosure models | Exact fields, precision, transition state, revocation and retention |
| Mobile testing/distribution | Expo Go is verified on a physical iPhone for M2 | Expo Go, development builds, store/test distribution | Future native dependency needs and the M3/team distribution approach |

### Architecture Decisions Requiring Team Agreement

The team has not yet held or recorded an approval meeting for the following choices.

#### Backend execution model

1. **Decide:** whether trusted logic uses a separate server, Firebase Cloud Functions/another serverless platform, or direct Firebase SDK access for selected operations plus trusted server-side logic.
2. **Proposed direction:** evaluate a hybrid because simple owner-scoped reads may fit direct SDK access while matching, routing secrets, ride-request transitions, and capacity checks need a trusted boundary.
3. **Alternatives:** a dedicated server offers explicit API boundaries and runtime control; serverless reduces server operations; direct SDK access simplifies some flows but depends heavily on correctly tested data rules.
4. **Impact:** determines repository layout, APIs, security rules, local development, deployment, integration testing, and Gio/Kenny's interface.
5. **Participants:** Gio, Kenny, Justin, and Ray; Gio and Kenny should jointly document the selected boundary.

#### Firebase services beyond M2 persistence

1. **Decide:** which services provide identity, trusted execution, and local emulation now that Firestore is selected for the M2 persistence proof.
2. **Current status:** the Firebase JavaScript SDK and Firestore fixed-document read are implemented; Firebase Authentication and a trusted Firebase/server runtime are not.
3. **Alternatives:** Firebase Authentication and Cloud Functions, Firestore paired with a custom trusted API, or another identity/server platform.
4. **Impact:** shapes data queries, rules, concurrency, SDK usage, costs, testing, and environment configuration.
5. **Participants:** Kenny and Gio lead; Justin validates matching-query needs and Ray validates mobile SDK implications.

#### Routing provider and credential boundary

1. **Decide:** the provider and which calls originate from trusted application logic versus the mobile app.
2. **Proposed direction:** use a routing adapter from trusted logic for matching-related geocoding/duration requests, subject to provider restrictions.
3. **Alternatives:** Mapbox, Google Maps Platform, HERE, or another provider that satisfies directions, geocoding, licensing, and budget constraints.
4. **Impact:** changes data formats, rate limits, cache policy, secret handling, costs, attribution, and test fixtures.
5. **Participants:** Justin leads evaluation; Gio reviews service integration/security; Kenny reviews cost/deployment; Ray reviews any required client SDK.

#### Matching module boundary

1. **Decide:** the typed contract between application orchestration and Justin's provider-independent matching code.
2. **Proposed direction:** pure filtering/scoring functions receive normalized commutes and route estimates, while a separate orchestration layer invokes the routing adapter.
3. **Alternatives:** a backend module, a serverless callable function, or a standalone service; a standalone service is likely unnecessary unless evidence supports it.
4. **Impact:** controls testability, provider coupling, data exposure, deployment complexity, and how recommendations are explained.
5. **Participants:** Justin and Gio lead; Kenny reviews storage/query constraints and Ray reviews the result shape.

#### Product rules that affect architecture

1. **Decide:** schedule semantics, geographic prefilter, ranking, recurrence/dated rides, seat reservation, messaging eligibility, and staged location visibility.
2. **Proposed direction:** deterministic rules, privacy-minimizing fields, and trusted enforcement of consequential state changes.
3. **Alternatives:** the options summarized in the open-decisions table above.
4. **Impact:** changes the data model, indexes, transactions, UI states, authorization, matching tests, and routing volume.
5. **Participants:** all four team members, with each component owner preparing concrete examples and edge cases.

## 14. AI Assistance and Human Decisions

AI/Codex assisted with implementation scaffolding, code generation and refactoring, UI component implementation, Firestore integration, automated test creation and iteration, and documentation consistency review.

Human/team decisions defined the Seawolf Rides problem and user workflow; set the M2 prototype boundary versus the M3 MVP; selected React Native, Expo, TypeScript, and Firestore for the M2 persistence proof; defined the Match, Schedule, and Chats product structure; determined which location data should remain approximate or private before ride acceptance; and decided which M2 interactions are real versus simulated. The team also chose deterministic, explainable matching as the planned direction and placed real routing, authentication, messaging persistence, ride-request persistence, and payments in later milestones.

AI accelerated implementation and helped surface consistency issues, but it did not define the product requirements or independently approve product and architecture decisions. The team remains responsible for evaluating tradeoffs, approving unresolved decisions, reviewing generated work, and validating the result.

## 15. Next Steps

The shared development environment, Firestore technical heartbeat, frontend-only UX prototype, automated checks, physical-iPhone verification, and hosted CI run are complete for M2. Remaining team work is to review this evidence and decide whether the unresolved architecture items must be closed for the M2 submission or may be carried explicitly into M3.

Genuine next decisions and M3 work include:

1. Select the authentication implementation and Stony Brook email-verification flow.
2. Approve the trusted backend execution model and its boundary with direct Firestore client access.
3. Select a routing provider and define the routing-adapter credential boundary.
4. Agree on schedule compatibility, geographic prefiltering, matching thresholds, ranking, and tie-breaking rules.
5. Finalize recurring-relationship versus dated-ride modeling, seat reservation, location visibility, and message authorization.
6. Implement and test the persisted M3 product workflow for users, commutes, matching results, requests, and later messaging.

Ride requests, messaging persistence, full matching, routing, Stripe, Trip Mode, and on-the-go matching must not be inferred from the M2 frontend demonstrations. Stripe and Trip Mode remain stretch features, and on-the-go matching remains a reach goal.
