# Requirements Traceability Matrix (RTM) — Milestone 5

This document establishes the bidirectional traceability between Seawolf Rides product requirements (from M1 through M4/M5) and the automated test suites, integration tests, and manual verification scripts in the repository.

## Summary Status

- **Automated Mobile Unit Tests:** 479 tests (100% passing)
- **Automated Backend Callable Tests:** 26 tests (100% passing)
- **Emulator Integration Suites:** Auth, Firestore Security Rules, Account Safety/Support, Ride Presentation
- **Continuous Integration (CI):** Parallel GitHub Actions checks on every Pull Request (Build bundle export, TypeScript type-check, ESLint, Unit tests)

---

## 1. Authentication, Identity & Profiles

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-AUTH-01** | Mandatory `@stonybrook.edu` email verification; non-SBU domains rejected | `mobile/src/auth/authValidation.ts`, `functions/src/` | `mobile/test/auth-validation.test.mjs`, `mobile/integration/firebase-auth.integration.mjs` | **Verified** |
| **REQ-AUTH-02** | Password length policy (>= 8 chars on register, unconstrained on login) | `mobile/src/auth/authValidation.ts` | `mobile/test/auth-validation.test.mjs` | **Verified** |
| **REQ-AUTH-03** | Persistent auth session survival across app relaunches | Firebase Auth device persistence | `mobile/test/app-config.test.mjs`, manual multi-device check | **Verified** |
| **REQ-PROF-01** | Owner-only profile and commute schema enforcement | `firestore.rules`, `commuteModel.ts` | `mobile/integration/firestore-rules.integration.mjs`, `mobile/test/commute-calendar.test.mjs` | **Verified** |
| **REQ-PROF-02** | Public commuter profiles with verified badges, bios, and majors | `mobile/src/account/`, `PublicProfileModal.tsx` | `mobile/test/account-actions.test.mjs`, `mobile/test/commute-calendar.test.mjs` | **Verified** |
| **REQ-VEH-01** | Driver vehicle configuration (make, model, color, seats, license plate) | `mobile/src/vehicle/vehicleModel.ts` | `mobile/test/vehicle-model.test.mjs` | **Verified** |

---

## 2. Commute Calendar & Schedule Management

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-CAL-01** | Bidirectional commute coordination: Morning (`TO_CAMPUS`) & Evening (`FROM_CAMPUS`) | `mobile/src/commute/commuteModel.ts`, `CommuteCalendarScreen.tsx` | `mobile/test/commute-calendar.test.mjs`, `mobile/integration/commute-calendar.integration.mjs` | **Verified** |
| **REQ-CAL-02** | Per-day commute mode overrides (`Drive`, `Ride`, `Either`, `Skip`) | `mobile/src/calendar/calendarMatching.ts` | `mobile/test/calendar-home.test.mjs`, `mobile/test/flexible-matching.test.mjs` | **Verified** |
| **REQ-CAL-03** | Saved-week recurring schedule with dated exception handling | `mobile/src/calendar/calendarMatching.ts` | `mobile/test/commute-calendar.test.mjs`, `mobile/test/calendar-client.test.mjs` | **Verified** |
| **REQ-CAL-04** | Campus arrival and departure window compatibility | `mobile/src/commute/arrivalPolicy.ts` | `mobile/test/dropoff-arrival.test.mjs`, `mobile/test/traffic-calendar.test.mjs` | **Verified** |

---

## 3. Deterministic Matching & Geospatial Routing

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-MAT-01** | Bounded driver detour limit (< 30 minutes added driving time) | `functions/src/calendarMatching.ts`, `mobile/src/calendar/` | `functions/test/tomtom-routing.test.cjs`, `mobile/test/flexible-matching.test.mjs` | **Verified** |
| **REQ-MAT-02** | Real-time passenger seat capacity tracking preventing over-booking | `mobile/src/rides/groupAcceptance.ts`, `functions/src/rideRequests.ts` | `mobile/test/ride-cancellation.test.mjs`, `mobile/integration/ride-presentation.integration.mjs` | **Verified** |
| **REQ-MAT-03** | Multi-passenger detour calculation with shortest permutation ordering | `mobile/src/navigation/routeNavigationRequest.ts` | `mobile/test/route-navigation-request.test.mjs` | **Verified** |
| **REQ-ROU-01** | OSRM road geometry preview (Start ➔ Pickup ➔ Campus Destination) | `mobile/src/routing/osrmAdapter.ts` | `mobile/test/osrm-adapter.test.mjs`, `mobile/test/tripDirections.test.mjs` | **Verified** |
| **REQ-ROU-02** | External navigation handoff to Apple Maps and Google Maps | `mobile/src/calendar/tripDirections.ts` | `mobile/test/tripDirections.test.mjs` | **Verified** |
| **REQ-ROU-03** | Traffic-aware departure forecasting with monthly budget enforcement | `functions/src/tomtomRouting.ts` | `functions/test/tomtom-routing.test.cjs` | **Verified** |
| **REQ-ROU-04** | Rate-limit resilience: automatic request pacing, retry, and client cooldown | `mobile/src/routing/osrmAdapter.ts`, `functions/src/demoRouting.ts` | `functions/test/demo-routing.test.cjs`, `mobile/test/osrm-adapter.test.mjs` | **Verified** |

---

## 4. Carpool Proposals, Amendments & Decision Lifecycle

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-REQ-01** | Dated carpool requests with departure timing and gas contribution | `functions/src/rideRequests.ts`, `mobile/src/rides/` | `mobile/integration/ride-presentation.integration.mjs` | **Verified** |
| **REQ-REQ-02** | Multi-request swipeable review carousel with pagination dots (● ○) | `mobile/src/rides/LiveRideScreens.tsx` | `mobile/test/chat-ui.test.mjs`, physical device manual review | **Verified** |
| **REQ-REQ-03** | Atomic seat reservation locking preventing race conditions | `functions/src/rideRequests.ts` (Firestore transactions) | `mobile/test/ride-cancellation.test.mjs`, Firestore transaction tests | **Verified** |
| **REQ-REQ-04** | Mutual trip amendments: departure time chips (±10m, ±15m) & pickup shifts | `mobile/src/mvp/rideAmendmentModel.ts`, `rideAmendmentClient.ts` | `mobile/test/ride-amendment.test.mjs` | **Verified** |
| **REQ-REQ-05** | Ride cancellation with required reason and automatic seat release | `functions/src/rideRequests.ts`, `mobile/src/rides/` | `mobile/test/ride-cancellation.test.mjs` | **Verified** |

---

## 5. In-App Messaging & Interactive Action Sheets

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-MSG-01** | Participant-only real-time chat threads per carpool match | `mobile/src/chat/LiveChatScreens.tsx`, `firestore.rules` | `mobile/test/chat-ui.test.mjs`, `mobile/integration/firestore-rules.integration.mjs` | **Verified** |
| **REQ-MSG-02** | In-thread interactive proposal drawer & price change review cards | `mobile/src/chat/LiveChatScreens.tsx`, `ChatTripSheet.tsx` | `mobile/test/chat-ui.test.mjs` | **Verified** |
| **REQ-MSG-03** | Unread badge counts and message sequence ordering | `mobile/src/chat/` | `mobile/test/chat-ui.test.mjs` | **Verified** |

---

## 6. Non-Commercial Gas Sharing & Settlements

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-GAS-01** | Transparent formula: $1.00 base + 50% mileage + detour overhead | `mobile/src/payments/fuelPrices.ts`, `mobile/src/rides/` | `mobile/test/fuel-prices.test.mjs` | **Verified** |
| **REQ-GAS-02** | Driver price adjustment range (-50% to +50%) with counter-proposals | `mobile/src/rides/`, `mobile/src/chat/` | `mobile/test/fuel-prices.test.mjs`, `mobile/test/chat-ui.test.mjs` | **Verified** |
| **REQ-GAS-03** | Peer settlement tracking (Venmo, PayPal, Zelle, Cash) with receipts | `mobile/src/rides/` | `mobile/test/fuel-prices.test.mjs` | **Verified** |

---

## 7. Trust, Privacy & Account Safety

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-SAF-01** | Location privacy: exact coordinates hidden; coarse 2-mile radius pre-match | `functions/src/calendarMatching.ts`, `mobile/src/routing/` | `mobile/test/flexible-matching.test.mjs`, `mobile/test/commute-calendar.test.mjs` | **Verified** |
| **REQ-SAF-02** | Commuter blocking: hides mutual search results & locks active chat | `mobile/src/safety/safetyClient.ts`, `firestore.rules` | `mobile/test/account-actions.test.mjs`, `mobile/integration/firestore-rules.integration.mjs` | **Verified** |
| **REQ-SAF-03** | Misconduct reporting & structured problem reports (`supportReports`) | `mobile/src/account/ReportProblemScreen.tsx`, `firestore.rules` | `mobile/test/account-support.test.mjs`, `mobile/integration/account-support.integration.mjs` | **Verified** |
| **REQ-SAF-04** | Emergency contacts with device dial/SMS actions & owner isolation | `mobile/src/account/EmergencyContactScreen.tsx` | `mobile/test/account-support.test.mjs`, `mobile/integration/account-support.integration.mjs` | **Verified** |

---

## 8. In-Car Access (Apple CarPlay & Android Auto)

| Req ID | Requirement Description | Implementation Components | Verification / Test Suite | Status |
|---|---|---|---|---|
| **REQ-CAR-01** | Apple CarPlay custom React host & template navigation controller | `mobile/src/car/carApp.ts`, `@g4rb4g3/react-native-carplay` | `mobile/test/app-config.test.mjs`, patch verification | **Verified** |
| **REQ-CAR-02** | Android Automotive OS / Android Auto moving-map surface & maneuvers | `mobile/src/car/CarMapSurface.tsx`, `mobile/plugins/withAndroidAuto.js` | `mobile/test/app-config.test.mjs`, AAOS build verification | **Verified** |
| **REQ-CAR-03** | GPS emulator route playback runner (`car:demo`) | `mobile/scripts/car-demo.mjs`, `devFixtures/queensToCampus.ts` | `mobile/scripts/car-demo.mjs` automated runner | **Verified** |
