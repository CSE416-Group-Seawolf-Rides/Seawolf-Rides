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

The mobile development foundation uses React Native 0.86.3, Expo SDK 57.0.24, and TypeScript 6.0.3. Node.js 24.21.0 and npm are standardized for local development and CI. The M2 prototype uses the Firebase JavaScript SDK to read one restricted sample commute from Firestore; authentication, the final backend boundary, and a routing provider remain unresolved. Matching will begin with deterministic, independently testable rules rather than machine learning.

## Repository Structure

```text
.
├── .github/workflows/ci.yml  # Parallel lint, type-check, unit-test, and export checks
├── .gitignore
├── .nvmrc                    # Exact Node.js version
├── package.json              # Root convenience scripts
├── README.md
├── mobile/                   # Minimal Expo/React Native TypeScript application
│   ├── app.json
│   ├── package.json
│   ├── package-lock.json
│   ├── src/app/              # Expo Router routes: (auth) sign-in and (tabs) Home, Rides, Inbox, Account
│   ├── src/                  # Screens, shared UI, fixtures, auth, and Firestore read
│   └── test/
└── docs/
    ├── requirements.md       # Preserved M1 proposal and requirements
    ├── design.md             # M2 architecture and technical design
    └── architecture.mmd      # Editable Mermaid architecture diagram
```

No backend or Firebase Functions directory exists yet; those will be added only after the team confirms the backend architecture.

## Getting Started

### Required tools

- Git
- Node.js **24.21.0** (the exact version in `.nvmrc`)
- npm, included with Node.js
- Expo Go on an iOS or Android device for the initial physical-device workflow

macOS and Linux developers can use [nvm](https://github.com/nvm-sh/nvm). Windows developers can use [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm). Everyone should use the same Node.js version and committed npm lockfile regardless of operating system.

### Initial setup

```bash
git clone https://github.com/justinlee166/Seawolf-Rides.git
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
| `npm run lint` | Run Expo's ESLint configuration |
| `npm run typecheck` | Run TypeScript with `noEmit` |
| `npm run test` | Run the Node.js automated tests |
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

The M2 Firestore prototype requires six Firebase public client configuration values. From the repository root, create the ignored local file:

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

## Documentation

- [M1 proposal and requirements](docs/requirements.md)
- [M2 design](docs/design.md)
- [Editable architecture diagram](docs/architecture.mmd)
- [CI/CD and merge protection](docs/ci-cd.md)

## Development Status

The project is in M2 (design and setup). The Expo app demonstrates the intended Match, Schedule, and Chats experience and performs a real Firestore read for `commutes/sample-commute-001`, including initial, loading, success, missing-document, and recoverable-error states. The prototype has launched successfully on a physical iPhone using Expo Go, and GitHub Actions has completed successfully on `main` using `npm ci`, lint, type-check, tests, and the Expo export/build check.

### M2 Prototype Scope

- **Real:** the Match home screen can load the restricted sample commute from Firestore using local public Firebase client configuration.
- **Simulated locally:** search criteria, driver recommendations, ride requests, scheduled rides, route placeholders, conversations, and locally appended messages are typed frontend fixtures or component state.
- **Not implemented:** authentication, real matching, routing/maps, live traffic, persisted ride requests or chat, payments, and the M3 backend workflow.

## Team

| Team member | Primary role | Responsibilities |
|---|---|---|
| Giovanni Vitale (Gio) | Backend Engineer | APIs, application logic, authentication, and database integration |
| Justin Lee | Matching & Geospatial Engineer | Matching logic, schedule and location compatibility, routing integration, and detour calculations |
| Kenny Wong | Platform & Integration Engineer | Database design, messaging/notifications, deployment, CI/CD, and system integration |
| Phireyaanth Poobalaraj (Ray) | Mobile / Frontend Engineer | Mobile UI, navigation, screens, client-side state, and overall UX |
