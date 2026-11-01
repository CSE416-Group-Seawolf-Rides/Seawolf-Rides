# Seawolf Rides

## Overview

Seawolf Rides is a mobile-first carpool coordination platform for the Stony Brook community, developed for CSE 416 — Software Engineering. It is designed to help drivers and riders coordinate recurring and scheduled campus commutes by comparing timetables, travel direction, route compatibility, and pickup detours. The platform recommends practical matches and provides end-to-end carpool management, mutual trip modifications, messaging, and route previews without automatic dispatching or commercial ride-hailing.

## Core Features (M4 Scope)

The Milestone 4 implementation delivers the complete carpool lifecycle:

- **Verified SBU Identity & Public Profiles**: Stony Brook (`@stonybrook.edu`) email-verified authentication, vehicle configuration with seat capacity, and public commuter profiles with bios, majors, and verified badges.
- **Commute Calendar & Schedule Management**: Weekly schedule planning supporting bidirectional commutes (**To Campus / Morning** and **Return Home / Evening**) with per-day mode overrides (`drive`, `ride`, `either`, `skip`).
- **Deterministic Multi-Passenger Matching**: Candidate evaluation factoring in driver seat availability, overlapping arrival/departure windows, and bounded driver detour limits (under 30 minutes).
- **Carpool Proposal & Decision Lifecycle**:
  - Dated ride requests initiated by riders or drivers.
  - Multi-request review queue with horizontal swipe gestures and step navigation.
  - Mutual ride amendments (proposing departure time adjustments or pickup point changes).
  - Explicit accept, decline, and cancellation flows with atomic commitment locking preventing double-bookings.
- **In-App Messaging & Interactive Trip Cards**: Real-time Firestore chat threads per carpool match with live message delivery, message sequence tracking, and interactive modal cards to review gas share and accept/cancel proposals directly in conversation.
- **Fair Gas Cost Sharing**: Standard non-commercial gas share calculations powered by weekly Long Island fuel prices, driver price adjustments (-50% to +50%), and peer settlement tracking (Venmo, PayPal, Zelle, Cash) with receipt confirmation.
- **Turn-by-Turn Routing & Directions Handoff**: Multi-point road route previews via OSRM (and traffic-forecasted ETAs via TomTom) with accurate waypoint ordering and one-tap handoff to Apple Maps and Google Maps.
- **Trust & Safety Controls**: Commuter blocking (instantly hiding mutual search results and locking chat threads) and moderation reporting.

## Technology Stack

- **Mobile Client**: React Native 0.88, Expo SDK 58, React 19, TypeScript 5.9, Expo Router v4.
- **Backend & Cloud Services**: Firebase Cloud Functions (Node.js 24 runtime), Cloud Firestore, Firebase Authentication.
- **Routing & Maps**: Open Source Routing Machine (OSRM) for fast offline/local road geometry and distance metrics; TomTom Routing API for traffic-aware departure forecasting; `react-native-maps` for interactive native mapping.
- **Tooling & CI**: Node.js 24 and npm, parallel GitHub Actions CI workflow (lint, TypeScript type-check, 462 automated unit tests, and Expo bundle export).

## Repository Structure

```text
.
├── .github/workflows/ci.yml   # Parallel lint, type-check, unit tests, and export checks
├── .gitignore
├── .nvmrc                     # Exact Node.js version (24.21.0)
├── firebase.json              # Firebase production configuration
├── firebase.demo.json         # Firebase local emulator configuration
├── package.json               # Root convenience scripts
├── README.md
├── functions/                 # Firebase Cloud Functions backend
│   ├── src/                   # Matching engine, ride requests, chat, pricing, routing
│   ├── test/                  # Functions unit and integration tests
│   └── package.json
├── mobile/                    # Expo/React Native TypeScript mobile application
│   ├── app.json
│   ├── package.json
│   ├── scripts/               # Demo seed scripts, test helpers, local runner
│   ├── src/app/               # Expo Router file-based screens: (auth), (tabs) Home, Rides, Map, Inbox, Account
│   ├── src/                   # Commute calendar, matching, chat, payments, safety, navigation
│   └── test/                  # Node.js automated unit test suite (462 tests)
└── docs/                      # Architectural, requirement, and operational documentation
```

## Getting Started

### Required Tools

- Git
- Node.js **24.21.0** (the exact version specified in `.nvmrc`)
- npm (bundled with Node.js)
- Expo Go on an iOS or Android device (or an Android/iOS emulator)

macOS and Linux developers can use [nvm](https://github.com/nvm-sh/nvm). Windows developers can use [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm).

### Initial Setup

```bash
git clone https://github.com/CSE416-Group-Seawolf-Rides/Seawolf-Rides.git
cd Seawolf-Rides
nvm install
nvm use
cd mobile
npm ci
cd ../functions
npm ci
cd ..
```

Do not run `npm ci` at the repository root; dependencies reside in `mobile/` and `functions/`.

### Running the Local Demo

Seawolf Rides provides a completely hermetic local environment using Firebase Local Emulators and pre-seeded student accounts (Wolfie, Alex, Maya, Jordan, Chris, and Sam).

1. **Start the Firebase Emulators** (terminal 1):
   ```bash
   npx firebase-tools emulators:start --config firebase.demo.json --project demo-seawolf-rides --only auth,firestore,functions
   ```

2. **Seed Demo Accounts & Rides** (terminal 2):
   ```bash
   npm run seed:demo --prefix mobile
   ```
   *Default Demo Credentials:* `demo@stonybrook.edu` / `seawolf-demo-2026` (Wolfie).

3. **Start Expo Development Server** (terminal 2):
   ```bash
   cd mobile
   npx expo start --lan
   ```
   Open Expo Go on your phone and scan the displayed QR code. (Ensure the phone and PC are connected to the same Wi-Fi network).

## Development & Testing

Common commands can be run from the repository root:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Expo mobile development server |
| `npm run lint` | Run ESLint and Expo project checks across `mobile/` |
| `npm run typecheck` | Run TypeScript verification with `noEmit` |
| `npm test --prefix mobile` | Run the complete mobile test suite (462 automated unit tests) |
| `npm test --prefix functions` | Run Firebase Cloud Functions backend tests |
| `npm run build` | Export a local Android JavaScript bundle as a non-publishing CI check |
| `npm run seed:demo --prefix mobile` | Reset and reseed emulator accounts, schedules, rides, chats, and amendments |

### Daily Workflow

```bash
nvm use
git pull origin main
cd mobile
npm ci
npm run start
```

Run `npm test --prefix mobile` and `npm run typecheck --prefix mobile` prior to opening pull requests. CI enforces 100% green checks on all PRs before merging.

### Environment Configuration

For development connecting to hosted Firebase rather than the emulators, copy `mobile/.env.example` to `mobile/.env` and supply the project keys:

```text
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

These are public client identifier keys embedded into the Expo bundle. Never place server private secrets into `mobile/.env`.

## Documentation Index

Detailed documentation for each subsystem is maintained in [`docs/`](docs/):

### Core Architecture & Specifications
- [M1 Proposal & Requirements](docs/requirements.md)
- [M2 System Architecture & Design](docs/design.md)
- [Architecture Diagram (Mermaid)](docs/architecture.mmd)
- [CI/CD & Merge Protections](docs/ci-cd.md)

### Commute & Matching
- [Commute Calendar Specification](docs/commute-calendar.md)
- [Canonical M3 Matching Engine](docs/canonical-matching.md)
- [Drop-off & Arrival Matching](docs/dropoff-arrival.md)
- [Traffic ETA & Departure Forecasting](docs/traffic-eta.md)

### Carpools, Chat & Payments
- [Carpool Requests & Seat Commitments](docs/carpool-requests.md)
- [In-App Messaging & Real-Time Inbox](docs/local-chat.md)
- [Chat Timeline & Interactive Cards](docs/chat-timeline.md)
- [Ride Cancellation & Settlement Flow](docs/ride-cancellation.md)
- [Fair Gas Cost Sharing & Settlements](docs/gas-shares.md)

### Trust, Safety & Profiles
- [Public Profiles & Verification Workflows](docs/profile-workflows.md)
- [Commuter Blocking & Reporting](docs/blocking-reporting.md)

## Development Status

Milestone 4 (M4) is **fully implemented and verified**. The platform provides an operational carpool coordination flow including authentication, schedule creation, multi-passenger candidate discovery, bidirectional morning and return rides, carpool proposals with swipeable reviews, in-app messaging, mutual ride amendments, gas cost sharing, turn-by-turn navigation handoff, and trust/safety moderation.

Automated verification includes 462 mobile unit tests, full TypeScript compilation, lint checks, and reproducible local emulator seed scripts.

## Team

| Team member | Primary role | Responsibilities |
|---|---|---|
| Giovanni Vitale (Gio) | Backend Engineer | APIs, application logic, authentication, and database integration |
| Justin Lee | Matching & Geospatial Engineer | Matching logic, schedule and location compatibility, routing integration, and detour calculations |
| Kenny Wong | Platform & Integration Engineer | Database design, messaging/notifications, deployment, CI/CD, and system integration |
| Phireyaanth Poobalaraj (Ray) | Mobile / Frontend Engineer | Mobile UI, navigation, screens, client-side state, and overall UX |
