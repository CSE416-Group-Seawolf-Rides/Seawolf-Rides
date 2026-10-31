# Seawolf Rides

## Overview

Seawolf Rides is a mobile-first carpool coordination platform for the Stony Brook community, developed for CSE 416 — Software Engineering. It is designed to help drivers and riders plan recurring or scheduled commutes by comparing schedules, travel direction, route compatibility, and estimated pickup detour. The system will recommend practical matches; it will not automatically dispatch or assign rides.

## Core Features

The planned semester scope includes:

- Stony Brook email-based authentication and user profiles
- Driver and rider commute profiles for planned and recurring travel
- Deterministic schedule, location, route, and detour matching
- Ranked recommendations controlled by driver seat and detour preferences
- Ride request accept, reject, and cancel flows
- Basic messaging and persistent shared data
- External routing integration

These are requirements, not claims of implemented functionality. Stripe cost sharing and Trip Mode are stretch goals; on-the-go matching is a major reach goal.

## Technology Stack

The mobile development foundation uses React Native 0.88, Expo SDK 58, React 19, and TypeScript 5.9. Node.js 24 and npm are standardized for local development and CI. Firebase Authentication provides verified Stony Brook identities, Cloud Firestore stores profiles, commutes, vehicles, and ride commitments, while Cloud Functions powers the deterministic matching engine, multi-passenger capacity management, and OSRM/TomTom road routing; see [M3 setup](docs/m3-matching-mvp.md).

## Repository Structure

```text
.
├── .github/workflows/ci.yml  # Parallel lint, type-check, unit-test, and export checks
├── .gitignore
├── .nvmrc                    # Exact Node.js version
├── package.json              # Root convenience scripts
├── README.md
├── functions/                # Firebase Cloud Functions (matching, ride requests, chat, pricing)
├── mobile/                   # Expo/React Native TypeScript mobile application
│   ├── app.json
│   ├── package.json
│   ├── package-lock.json
│   ├── src/app/              # Expo Router routes: (auth), (tabs) Home, Rides, Map, Inbox, Account
│   ├── src/                  # Calendar, matching, routing, profiles, vehicle, chat, theme
│   └── test/                 # Node.js automated unit tests
└── docs/
    ├── requirements.md       # Preserved M1 proposal and requirements
    ├── design.md             # M2 architecture and technical design
    └── architecture.mmd      # Editable Mermaid architecture diagram
```

## Getting Started

### Required tools

- Git
- Node.js **24.21.0** (the exact version in `.nvmrc`)
- npm, included with Node.js
- Expo Go on an iOS or Android device for the initial physical-device workflow

macOS and Linux developers can use [nvm](https://github.com/nvm-sh/nvm). Windows developers can use [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm). Everyone should use the same Node.js version and committed npm lockfile regardless of operating system.

### Initial setup

```bash
git clone https://github.com/CSE416-Group-Seawolf-Rides/Seawolf-Rides.git
cd Seawolf-Rides
nvm install
nvm use
cd mobile
npm ci
```

Do not run `npm ci` at the repository root: dependencies and `package-lock.json` currently live in `mobile/`. With nvm-windows, use `nvm install 24.21.0` and `nvm use 24.21.0`; with fnm, use `fnm use --install-if-missing 24.21.0`.

### Start Expo

From `mobile/`:

```bash
npm run start
```

Open Expo Go on Android and scan the terminal QR code, or scan it with the iOS Camera app. The phone and development computer generally need to be on the same local network. If Expo Go requests authentication, sign in to Expo Go and run `npx expo login` on the development computer using the same Expo account. If local network policy blocks the connection, try:

```bash
npm run start -- --tunnel
```

The starter application has successfully launched on a physical iPhone using Expo Go.

## Development

After the initial `mobile/npm ci`, common commands can be run from the repository root:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Expo development server |
| `npm run doctor` | Validate Expo dependency and project compatibility |
| `npm run lint` | Run Expo's ESLint configuration |
| `npm run typecheck` | Run TypeScript with `noEmit` |
| `npm run test` | Run the Node.js automated tests |
| `npm run test:firebase-auth` | Run registration, verification, sign-in, and password-reset tests in the local Auth emulator |
| `npm run test:firestore-rules` | Run owner-access Firestore rules tests in the local emulator |
| `npm run build` | Export a local Android JavaScript bundle as a non-publishing CI check |

The corresponding scripts also work from `mobile/` (`npm run start`, `npm run lint`, and so on). The build script is an Expo export check, not an EAS cloud build or signed app-store build.

For daily development:

```bash
nvm use
git pull
cd mobile
npm ci
npm run start
```

Run `npm ci` whenever `mobile/package-lock.json` changes. To add an Expo or React Native dependency, use `npx expo install <package>` from `mobile/` so Expo selects an SDK-compatible version. After changing dependencies, run all checks and commit both `mobile/package.json` and `mobile/package-lock.json`. Do not create Yarn or pnpm lockfiles.

### Environment variables

Firebase Authentication and Firestore require six public client configuration values. From the repository root, create the ignored local file:

```bash
cp mobile/.env.example mobile/.env
```

Fill in these values for the development Firebase project:

```text
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

Firebase's `EXPO_PUBLIC_*` values are public client configuration embedded in the application bundle; they are not private server secrets. Do not commit `mobile/.env`. Private API secrets, administrative credentials, and unrestricted server-side keys must remain outside the mobile application and will be designed with the future trusted backend.

### Firebase Authentication and persistence

In Firebase Console, initialize Authentication and enable the **Email/Password**
provider before running the app. New users must register with an
`@stonybrook.edu` address and follow Firebase's verification email before they can
enter the application.

Firebase Auth sessions use device storage and survive normal app relaunches. After
sign-in, the app loads `users/{uid}` and `users/{uid}/commutes/primary`; onboarding
and later commute edits write back to those paths. The versioned Firestore rules
require the matching UID, a verified email claim, and the exact
`@stonybrook.edu` domain. Run `npm run test:firestore-rules` to verify verified-owner
access, unverified/outside-domain rejection, cross-user denial, and persistence
round trips in the local emulator.

Saves wait up to ten seconds for server confirmation before showing a recoverable
"Save still pending" message. Onboarding keeps your answers and enables the button
again. Retrying the same change waits on the original write; another change is
blocked until that write succeeds or fails. When confirmation arrives, the active
session updates even if the wait timed out. Keep the app open and reconnect to
finish a pending save; unconfirmed writes are not guaranteed to survive a relaunch.

Deploy the versioned rules before testing production writes:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

## Documentation

- [M1 proposal and requirements](docs/requirements.md)
- [M2 design](docs/design.md)
- [Editable architecture diagram](docs/architecture.mmd)
- [CI/CD and merge protection](docs/ci-cd.md)
- [Canonical M3 matching API](docs/canonical-matching.md)

## Development Status

The code now includes the M3 single-driver/single-rider inbound matching flow. Home and Map use saved matching setup and the authenticated callable service. Deploy the service, rules and index and complete the two-client manual acceptance check before calling the hosted MVP operational; merging alone does not deploy it.

### Current Scope

- **Implemented:** verified Firebase email/password accounts, password reset, persistent device sessions, owner-only profile/commute/matching setup, canonical feasibility/ranking, OSRM adapter, protected real-candidate discovery and matching results.
- **Development-only:** synthetic multi-car/group/request simulations, clearly labeled and excluded from the normal matching flow.
- **Later work:** persisted requests and seat reservations, participant messaging/history, return trips, native navigation, payments and live tracking. Static road estimates are not live traffic.

See [M3 matching setup, deployment, limits and acceptance](docs/m3-matching-mvp.md). Automated callable/emulator tests use real saved accounts and mocked road estimates; they do not establish device UI or live routing verification.

## Team

| Team member | Primary role | Responsibilities |
|---|---|---|
| Giovanni Vitale (Gio) | Backend Engineer | APIs, application logic, authentication, and database integration |
| Justin Lee | Matching & Geospatial Engineer | Matching logic, schedule and location compatibility, routing integration, and detour calculations |
| Kenny Wong | Platform & Integration Engineer | Database design, messaging/notifications, deployment, CI/CD, and system integration |
| Phireyaanth Poobalaraj (Ray) | Mobile / Frontend Engineer | Mobile UI, navigation, screens, client-side state, and overall UX |
