# M3 demo on one Mac, without cloud deployment

The calendar branch replaces the technical matching form with saved-week matching. Follow [the calendar guide](commute-calendar.md) for its setup and demo; the explicit matching-settings walkthrough below describes the older path.

For the rider-request → driver-decision → shared accepted ride demonstration, follow [the dated request walkthrough](local-ride-requests.md) after this environment setup. It uses the same backend and persisted emulator data.

The backend is the local Firebase Auth, Firestore and Functions emulators under **`demo-seawolf-rides`**. The rider's mirrored physical iPhone and a simulator/second phone share those services and their saved data. Road estimates still leave the Mac for public OSRM; local hosting does not exempt them from the [provider's one-request-per-second policy](https://routing.openstreetmap.de/about.html). No billing account, Firebase login, Blaze upgrade, cloud function or paid hosting is needed for this workflow. Do not run `firebase deploy`.

## Prepare once

Use this PR's checkout. Keep the original checkout and any local edits in it intact. From the repository root:

```sh
nvm use                         # Node 24.21.0 from .nvmrc
java -version                   # Java 21 is required for the emulator suite
npm ci --prefix functions
npm ci --prefix mobile
npm run build --prefix functions
```

If Java is installed outside your PATH, add its `bin` directory in your shell. The function's declared deployment runtime is Node 22; local emulation uses the available Node 24 and CI also tests the compiled scheduler/domain under Node 22.

The launcher creates `functions/.env.local` exclusively, with the public OSRM URL, and removes it on normal exit. It refuses to overwrite an existing file: preserve any existing configuration elsewhere before running it. A hard kill can leave this file behind; inspect and move it aside rather than overwriting it. Existing cloud `functions/.env.seawolf-rides` and `mobile/.env` are not changed or required. All environment files, logs and `.local-demo-data/` exports are ignored by Git. Exports contain local accounts and should stay private.

## Start the backend (terminal 1, repository root)

```sh
node scripts/start-local-demo.mjs --live-osrm
```

This selects `firebase.demo.json`, fixes the project to `demo-seawolf-rides`, starts Auth 9099, Firestore 9095 and Functions 5001 on `0.0.0.0`, and enables the Mac-only Emulator UI at http://127.0.0.1:4000. The hub stays on 127.0.0.1:4400. `0.0.0.0` is a listening address, never a client address. Use a trusted local network: emulators and their administrative endpoints are not hardened public servers. Do not port-forward them.

The launcher imports `.local-demo-data/` when an export exists and exports Auth/Firestore data there on graceful Ctrl-C. Wait for export completion before closing the terminal. A hard kill can lose changes since the previous export. Both accounts, saved commutes, matching settings, route cache and scheduler state share this export. Do not run automated tests against a running manual demo: they require the same ports but use temporary data.

Wait until `findCompatibleDrivers` is initialized and the emulator table reports ready. Rules are loaded locally at startup. Firestore's emulator does not enforce composite-index requirements; this workflow does not wait on a cloud index or prove a production index is ready.

## Start Expo (terminal 2)

Find the Mac's current LAN IPv4 address, for example:

```sh
ipconfig getifaddr en0
```

If en0 is not your active interface, use System Settings → Wi-Fi → Details → TCP/IP or the active Ethernet interface. Substitute that numeric address below; do not commit it:

```sh
cd mobile
node scripts/start-local-demo.mjs YOUR_MAC_LAN_IPV4
```

The launcher overrides all six Firebase client settings with non-secret demo values, sets the same emulator host for Auth/Firestore/Functions, disables direct developer OSRM configuration, and starts Expo on LAN with a cleared bundle cache. It never edits `mobile/.env`. A demo project without an explicit emulator host fails closed in the app. Restart Expo and fully reload both clients if changing the address or project; Fast Refresh can retain initialized Firebase services.

- **Physical iPhone/teammate phone:** use the Mac LAN address for Firebase. `localhost` on a phone points to that phone. Join a network that permits peer connections and allow local-network access for Expo and incoming connections for Node/Java if macOS prompts. Expo's Metro port is normally 8081. A Metro tunnel alone does not tunnel the Firebase emulator ports.
- **iOS Simulator on this Mac:** 127.0.0.1 would reach the Mac, but use the same LAN-configured bundle as the iPhone so both have identical settings. Press `i` in Expo after installing/selecting Xcode and an iOS Simulator runtime. If unavailable, use the second phone.
- **Expo client:** use an SDK-57-compatible Expo Go/development client. Current Expo documentation requires Expo CLI and physical iOS Expo Go to use the same Expo account; if prompted, run `npx expo login` and sign into that account in Expo Go. This Expo login is separate from Firebase and does not require Firebase billing. Open the QR code on the rider iPhone and the same server on the driver client.
- **iPhone Mirroring:** start the app on the iPhone, then display/control it with the Mac's iPhone Mirroring app. Mirroring does not change its networking or make its localhost point to the Mac.

These steps prepare device testing; they do not claim it has been performed. If campus Wi-Fi isolates devices, use a private network/hotspot that permits Mac-to-phone traffic. Check all three emulator ports, not only Metro.

## Two-account walkthrough

Create two **emulator-only** accounts in the app, e.g. `m3-rider@stonybrook.edu` and `m3-driver@stonybrook.edu`, with separate passwords. These are not cloud accounts and need not be real email inboxes. Complete the app's email verification using the Auth emulator's verification link printed in terminal 1 (or retrieve the OOB action through its local API); no email is delivered. Open the generated action URL in a browser on the Mac. Return to Sign In and sign in after verification so the app obtains a fresh verified token. An unverified sign-in sends a new link and signs out again. Emulator UI Auth can inspect the accounts. Do not use production account passwords.

Save profiles and commutes, then matching setup on Home/Map:

| Input | Driver | Rider |
| --- | --- | --- |
| Role | Driver | Rider |
| Inbound day | Monday | Monday |
| Campus | West Side | West Side |
| Saved arrive-by | 09:00 | 09:00 |
| Passenger seats | 2 in saved commute | 1 needed |
| Public point | Stony Brook LIRR station | Stony Brook LIRR station |
| Departure / pickup window | 07:30–08:30 | 08:00–08:30 |
| Campus arrival window | 08:00–09:00 | 08:00–09:00 |
| Detour / extra ride allowance | 10 minutes | 15 minutes |
| Walking inputs and limits | Not applicable | 0 for this controlled test at the public pickup/drop-off |
| Matching/discovery | Enabled; save | Enabled; save |

Reload both clients. On the rider, search **2026-10-19** (Monday), or a future Monday within 30 days if testing later. All matching times use America/New_York. Confirm the correct driver's name, evaluated pickup/arrival times, detour and explanation. Preview requests only the rider's public pickup-to-campus route. Road estimates are static, not live traffic; boarding adds 120 seconds.

The one-driver fixture fits comfortably within the two-candidate cap. Discovery inspects the first two matching setups in UID order; it does not choose the globally best two from all drivers. With more than two setups, the UI prominently says **Incomplete search** even with no recommendations. Stale/invalid setups can consume this bounded selection. Keep only the intended driver opted in for the controlled demonstration.

Search/preview share one gate across clients. A simultaneous operation may return `resource-exhausted`/busy: wait a few seconds, then retry manually. There is no automatic network retry loop or unbounded wait queue. Cancelling a screen ignores its response; its backend operation finishes under the gate before releasing. No route failures are replaced with fabricated estimates.

Then change the driver's detour limit to 0, save, and search: the 120-second boarding cost should exclude this pair. Restore 10 minutes, save, then disable driver discovery and confirm removal. Restore discovery, sign out/in and verify saved settings. Stop the backend gracefully, restart it, and verify both accounts and commutes persisted.

## Abandoned scheduler recovery (emulator only)

Normal provider errors/timeouts, invalid requests and thrown work drain/release ownership in `finally`; a failed database release or killed worker deliberately leaves the owner occupied. There is no automatic time-based takeover. **Never clear it while an old Functions worker might resume.**

1. Stop both clients' actions and Expo. Ctrl-C terminal 1, wait for export and all emulators/workers to exit. Check `lsof -nP -iTCP:5001 -sTCP:LISTEN` is empty and inspect `ps -ax -o pid,ppid,command` for the old Firebase Functions worker/runtime (`firebase-tools`/`functionsEmulatorRuntime`). Terminate and wait for any surviving old worker before proceeding. Port closure alone does not establish that a detached worker has terminated.
2. If necessary move aside a stale `functions/.env.local` only after confirming the old backend is stopped. Start **Auth and Firestore only**, importing the export with the abandoned gate:

   ```sh
   npx --yes firebase-tools@15.33.0 emulators:start --config firebase.demo.json --project demo-seawolf-rides --only auth,firestore --import=.local-demo-data --export-on-exit=.local-demo-data
   ```

   Omit `--import` if there has never been an export. Keep Functions stopped.
3. In another root terminal run `node scripts/reset-local-demo-gate.mjs --workers-stopped`. This operator acknowledgment is required; the script additionally refuses if port 5001 is listening. It uses the Admin SDK only against the fixed loopback Firestore emulator for `demo-seawolf-rides`, deletes only `_m3Routing/publicOsrm`, then waits 1.2 seconds. It cannot target a cloud project, remove user data or reset ownership automatically.
4. Ctrl-C the recovery emulators and wait for export completion. Restart the complete backend using the normal launcher, then Expo. Only now retry matching. Keep route cache and account/commute data.

## Automated and live verification

With manual emulators stopped, run the existing checks documented in `m3-matching-mvp.md`. `npm run test:matching --prefix mobile` uses a **local fake router**, verifies two-account persisted discovery, separate-client overlap, search/preview exclusion, caching, timestamp spacing, detour edits, opt-out, provider errors, privacy, truncated discovery and atomic ownership. It exports temporary Auth/Firestore data, stops, restarts/imports and checks accounts/commutes/settings survived. Temporary test data is removed; manual `.local-demo-data/` is untouched.

For a separate minimal **live OSRM** check, start the manual backend and run once:

```sh
cd mobile
node --import ./scripts/node-test/register-ts-resolver.mjs scripts/smoke-local-demo.mjs --live-osrm
```

This creates two temporary emulator accounts/settings, invokes the actual callable search, waits through cooldown and invokes the preview. Two uncached paths are normally needed; preview reuses the baseline cache. It validates real positive road measurements and releases the gate, then deletes only its temporary accounts/documents. Do not run repeated smoke loops or load-test the public server. Existing opted-in demo drivers can affect discovery; run the smoke before creating other participants. Device UI behavior remains separate from this backend smoke.

## Verification recorded on 2026-10-17

- Fake-router callable tests passed, including two clients overlapping an uncached search, a preview receiving busy, cached search/preview reuse, truncation, provider failure, opt-out/detour edits and private reads. Auth accounts, saved commutes and revisions survived export, emulator stop, restart and import.
- A separate live public-OSRM smoke passed through the local callable and scheduler: station-to-West-Side route **1,385.2 meters / 246.9 seconds**. Search recommended the persisted driver; canonical integer metrics were 247 seconds solo / 367 seconds shared, including 120 seconds boarding. Preview reused the persisted baseline cache. This was one small smoke, not a load test.
- The LAN-bound services responded through the Mac LAN address from the Mac: Auth 200, Functions CORS preflight 204, private Firestore read 403 as required. The Expo launcher served an iOS bundle containing the demo project, dummy API key and LAN host. These do not prove phone connectivity.
- Recovery script refused while Functions was listening. After stopping the full backend and restarting only Auth/Firestore from the export, a deliberately abandoned test owner was removed; both cached routes were preserved. Graceful shutdown exported the recovered state.
- No physical iPhone, mirroring or simulator UI acceptance was performed. `xcrun simctl` was unavailable on the reviewing Mac. Use the second-phone option or install/configure Xcode and an iOS Simulator runtime before the device walkthrough.

References: [Firebase emulator import/export](https://firebase.google.com/docs/emulator-suite/install_and_configure), [demo project isolation](https://firebase.google.com/docs/emulator-suite/connect_functions), [Expo device setup](https://docs.expo.dev/get-started/start-developing/).
