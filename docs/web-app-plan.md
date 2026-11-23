# Seawolf Rides on the Web — Design, Build and Free Deployment Plan

Status: proposal for M6 · Target: live pilot before the Dec 7 poster session

## 1. Goal and scope

Ship the existing Expo app as a website that SBU commuters can open from a link on a phone or a laptop, backed by the same Firebase project as the mobile app, at no cost.

- **One codebase.** Expo Router already builds for the web. We add web-specific files only where a native module has no browser equivalent (`Component.web.tsx` next to `Component.tsx`). No separate site, no fork.
- **Same workflow, web-friendly layout.** Every flow (sign-in, onboarding, calendar, matching, requests, chat, amendments, gas shares, account safety) works the same way. What changes is layout, input (mouse and keyboard), and a few native-only widgets.
- **Same backend and data.** The app already uses the `firebase` JavaScript SDK, so Auth, Firestore, Cloud Functions and security rules are shared. An account made on the web signs into the phone app and the reverse.
- **Out of scope on web:** Android Auto / in-car navigation, developer demo screens (`matching-demo`, `demo-home`, `demo-day`, `demo-map`, `driver-test`, `find-riders-demo`, `route-planner`, three-car demo). These stay mobile/dev only.

## 2. Visual direction

### 2.1 Keep the palette, change how much red we use

The tokens in `mobile/src/theme.ts` stay exactly as they are:

| Token | Value | Web use |
|---|---|---|
| `background` | `#f5f6f7` | Page background everywhere |
| `surface` | `#ffffff` | Cards, panels, dialogs, sidebar |
| `surfaceMuted` | `#f0f2f4` | Table stripes, hover fill, input fill |
| `text` / `textMuted` | `#17212b` / `#66717d` | Body / secondary text |
| `border` | `#dde1e5` | Card and input borders, dividers |
| `accent` | `#990000` | Primary buttons, active nav item, links, focus ring, key numbers |
| `accentDark` | `#700000` | Primary button hover / pressed |
| `accentSoft` | `#f8eaea` | Selected chips, active nav background, unread badges |
| `success`, `warning`, `error` (+ soft) | unchanged | Status pills only |

**Rule: red is an accent, never a surface.** On a large screen a full-red card or header reads as an alarm and dominates the page. On web:

- No full-bleed red backgrounds or red cards. The current **Your Next Trip** card (`src/rides/components/NextTripCard.tsx`, `backgroundColor: colors.accent`) becomes a white card with a 4px red top or left stripe, a red `NEXT TRIP` eyebrow, dark headline text, and one red primary button.
- At most **one solid red button per view** (the primary action). Secondary actions use the outline style (`border` + `text`).
- Red appears in small amounts: active nav item, links, selected chips (`accentSoft` fill + `accent` text), focus rings, the logo.
- Status uses its own colors (green confirmed, amber pending), never red, so red keeps meaning "Stony Brook / primary action".

We recommend applying the same Next Trip change to mobile too, so both platforms look alike.

### 2.2 Type, spacing, shape

- System font stack (`-apple-system, Segoe UI, Roboto, …`) or Inter if we want to match the deck. Base text **16px** on web (mobile is 15). Headings 32 / 24 / 20 / 17.
- Line length capped at about 70 characters (`maxWidth: 680` for text blocks such as help, terms, privacy).
- Keep `spacing` and `radii` tokens; on desktop use one step larger padding inside cards (`xl` 24 instead of `lg` 16).

### 2.3 Card spec (web)

| Property | Value |
|---|---|
| Background | `surface` |
| Border | 1px `border`, radius `radii.md` (14) |
| Padding | 16 on phone width, 24 at ≥ 640px |
| Shadow | none at rest; `0 2px 8px rgba(23,33,43,0.08)` on hover for clickable cards |
| Hover (clickable) | border `#c9ced4`, shadow as above, `cursor: pointer` |
| Focus (keyboard) | 2px `accent` outline, 2px offset |
| Header row | title 17/600 `text`, optional status pill at right |
| Actions | bottom-right, primary red + secondary outline |
| Grid | 1 column < 640, 2 columns 640–1279, 3 columns ≥ 1280 for lists such as match results |

Status pills: `successSoft` / `warningSoft` / `errorSoft` fill with matching text color, radius `pill`, 12/600 uppercase.

## 3. Responsive layout

### 3.1 Breakpoints

| Name | Width | Navigation | Content |
|---|---|---|---|
| Phone | < 640px | Bottom tab bar (as today) | Single column, full width, 16px gutters |
| Tablet | 640–1023px | Bottom tab bar | Centered column, max 720px |
| Desktop | ≥ 1024px | Left sidebar (240px): logo, Home, Rides, Map, Inbox, Account, user avatar + sign out at bottom | Max 1200px, two-pane layouts below |

Implementation: a `useBreakpoint()` hook built on `useWindowDimensions()`, a `WebShell` layout used by `(tabs)/_layout.tsx` on web that renders either `BottomTabBar` or a new `SideNav`, and a `ContentContainer` (`maxWidth` + `alignSelf: 'center'`). Nothing changes for native builds.

### 3.2 Screen by screen

| Area | Phone width (web) | Desktop |
|---|---|---|
| **Welcome / sign-in** (`WelcomeScreen`, `EmailAuthScreen`) | Same as app | Split screen: left half light brand panel (`background`) with the route illustration and one-line pitch for commuters; right half a 420px sign-in card. No red background. |
| **Onboarding and commute setup** (`FlowStep`, `onboarding/*`, `commute-setup/*`) | Same one-question-per-screen flow | Centered 560px card on the gray page. Progress bar at the top of the card, Back at top-left, **Continue pinned to the bottom of the card**, not the bottom of the window. Enter = Continue. Each step keeps its own URL so the browser Back button works. Choice cards (role, campus spot) in a 2-column grid. |
| **Start area step** (`StartAreaStep`, `PrivacyAreaMap`) | Search field, map below | Search + results on the left, privacy-circle map on the right |
| **Schedule / times** (`TimeField`) | Native time input | Browser `<input type="time">` styled like our fields; week grid as a 7-column table with arrive / leave rows |
| **Home** (`HomeScreen`, `CommuteCalendarScreen`) | As app | Two columns: left (fixed 380px) Next Trip card, This week strip, Needs you; right Find commuters with the morning / evening toggle and results as a card grid |
| **Calendar sheet** (`CommuteCalendarSheet`) | Bottom sheet | Right-side panel (420px) that slides over content; Esc closes |
| **Match results** (`CommuteMatchesSheet`) | Bottom sheet, paged | Card grid with Prev / Next and page indicator; clicking a card opens details in the side panel |
| **Review requests carousel** (`LiveRequestReviewScreen`) | Swipe + Prev/Next | Prev / Next buttons and ← → keys; on wide screens show the current request large with neighbors visible |
| **Rides** (`RidesScreen`, `TripDetailScreen`, `[rideId]`) | List → detail | Master-detail: list on the left (400px), selected trip on the right with route map, itinerary, amendments, gas share, Cancel ride |
| **Inbox** (`ChatsScreen`, `LiveChatScreens`, `ChatTripSheet`) | List → conversation | Classic three-zone chat: threads (320px), conversation, and a collapsible trip-details panel. Enter sends, Shift+Enter new line. Trip cards render inline as on mobile. |
| **Map** (`MapScreen`, `CommuteMapScreen`, `RouteMap`, `AcceptedTripMap`) | Full-screen map | Full-height map with a left panel for route summary and stops |
| **Account** (`AccountScreen` and `account/*`) | Settings list → page | Settings list on the left as sub-nav, selected page on the right; forms max 560px |
| **Public profile** (`profile/[participantId]`) | Full screen | Centered 640px card or a dialog when opened from chat / match |
| **Dialogs and confirmations** | Bottom sheet | Centered modal, max 480px, dimmed backdrop, Esc and backdrop click close, focus trapped |

## 4. Making everything work in a browser

### 4.1 Known gaps (from reading the code)

| Item | Where | Problem on web | Fix |
|---|---|---|---|
| `Alert.alert` confirmations | 11 calls in 9 files: `CommuteCalendarScreen`, `commute-setup/review`, `account/index`, `onboarding/done`, `useRideDecision`, `EditProfileScreen`, `SessionProvider`, `BlockedUsersScreen`, `useCommuteEdit` | React Native Web does not show native alerts, so sign out, unblock and discard-changes prompts silently do nothing | Shared `confirm()` helper: native → `Alert.alert`, web → our own `ConfirmDialog` (section 3.2 dialog spec) |
| `react-native-maps` | 9 files: `AcceptedTripMap`, `CommuteMapScreen`, `CommuteMatchesSheet`, `ChatTripSheet`, `PrivacyAreaMap`, `StartAreaStep`, `RouteMap`, `BasicNavigationScreen`, `MapScreen` | No web support | Wrap maps behind one `MapView` interface; `MapView.web.tsx` uses Leaflet (`react-leaflet`) with OpenStreetMap tiles, polyline, markers and the privacy circle. Free, with OSM attribution shown |
| Date / time picker | `src/commute/components/TimeField.tsx` | `@react-native-community/datetimepicker` has no web build | `TimeField.web.tsx` with `<input type="time">` |
| Auth session storage | `src/firebase/firebase.ts:62` | `getReactNativePersistence(AsyncStorage)` is native-only | On web use `browserLocalPersistence` |
| Emulator host | `firebase.ts` | Web must talk to hosted Firebase in production | Read config from `EXPO_PUBLIC_FIREBASE_*`; emulator only when `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` is set |
| Payment hand-off | `SettleUpSheet`, `PaymentMethodsScreen` | `venmo://` style links do nothing on desktop | Fall back to `https://venmo.com/u/<handle>` and `https://paypal.me/<handle>`; Zelle stays copy-to-clipboard |
| Call / Text emergency contact | `EmergencyContactScreen` | `tel:` / `sms:` work on phones, not most desktops | Keep links; on desktop also show the number with a Copy button |
| Directions hand-off | `tripDirections.ts` | Apple Maps scheme is iOS-only | Use Google Maps web directions URL on web (works on every device) |
| Location | `expo-location` (3 files) | Needs HTTPS and browser permission | Firebase Hosting is HTTPS; show a short explainer before the prompt and keep town search as the fallback |
| Photo upload | `expo-image-picker`, `expo-image-manipulator` | Web uses a file chooser; resizing must be verified | Test; if resizing fails, resize with a canvas in a `.web.ts` helper |
| Haptics | `expo-haptics` (18 imports) | No-op on web | Nothing to do |
| Sheets and modals | `<Modal>` in 14 files, 3 `presentation: 'modal'` routes | Work, but full-width and phone-shaped | Apply dialog / side-panel sizing from section 3.2 |
| Car and demo routes | `src/car`, demo screens | Not for web users | Hide from web navigation and redirect to Home |

### 4.2 Test web build result

See section 9 (filled in from a test `expo export --platform web` on a clean copy of `main`).

### 4.3 Interaction details

- Every pressable gets a hover state and a visible keyboard focus ring; Tab order follows reading order.
- Swipe-only interactions get buttons and arrow keys.
- Pull-to-refresh is replaced by live Firestore listeners (already in place) plus a refresh button where needed.
- Page titles per route (`Seawolf Rides · Inbox`) and a favicon / app icon from `assets/`.
- Optional: a web app manifest so phones can "Add to Home Screen" with our icon (free, no store).

## 5. Backend changes for a hosted deployment

1. **Turn on hosted mode.** The ride, matching, vehicle and estimate callables (`rideRequests.ts`, `calendarMatching.ts`, `matchingRuntime.ts`, `commuteEstimate.ts`, `vehicle.ts`) refuse to run outside the `demo-seawolf-rides` emulator. Replace that check with an explicit setting (for example `SEAWOLF_HOSTED=true` in `functions/.env.seawolf-rides`) so the emulator stays the default and production is a deliberate opt-in.
2. **Routing.** Keep public OSRM with the existing 1-request-per-second gate and cache for the pilot. Keep TomTom traffic **off** for the pilot (no key to manage); turn it on later with `firebase functions:secrets:set TOMTOM_API_KEY` and the built-in monthly budget.
3. **Cost guards.** `maxInstances` on every callable (for example 5), a Google Cloud budget alert at $1, and Firestore usage alerts. These keep a mistake from becoming a bill.
4. **Auth.** Enable Email/Password, add the hosting domain to Authorized domains, and set the verification email's continue URL to the web app.
5. **Rules and indexes.** Deploy `firestore.rules` and `firestore.indexes.json` (already in the repo).

## 6. Free deployment plan

| Piece | Service | Cost at pilot scale | Notes |
|---|---|---|---|
| Web app | Firebase Hosting | $0 (free quota) | HTTPS, global CDN, free `seawolf-rides.web.app` URL, preview URLs per PR |
| Backend functions | Cloud Functions on the Blaze plan | $0 within 2M calls/month | Blaze needs a card on file; budget alert + `maxInstances` cap risk |
| Database and auth | Firestore + Firebase Auth | $0 within free quotas | Same project the mobile app uses |
| Maps | Leaflet + OpenStreetMap tiles | $0 | Fair-use policy: fine for a pilot, show attribution |
| Routing | Public OSRM | $0 | Rate-limited; existing gate handles it |
| Address search | Photon (komoot) | $0 | Already used by the app |
| Custom domain | optional | ~$12/yr | Skip for the pilot |

### 6.1 Deploy steps

Deploys always name `--project seawolf-rides`. The repo has no `.firebaserc`, so no script can reach the real project by default; local and CI scripts keep passing `--project demo-seawolf-rides`.

```bash
# one time, on the deploying machine
npx firebase-tools login
# functions/.env.seawolf-rides (git-ignored):
#   SEAWOLF_HOSTED=true
#   OSRM_BASE_URL=https://router.project-osrm.org

# backend (the functions predeploy step builds them)
npx firebase-tools deploy --project seawolf-rides --only functions,firestore:rules,firestore:indexes

# web app: mobile/.env must hold the real seawolf-rides EXPO_PUBLIC_FIREBASE_* values
# and no EXPO_PUBLIC_FIREBASE_EMULATOR_HOST
cd mobile && npm run build:web && cd ..   # writes mobile/dist-web (git-ignored)
npx firebase-tools deploy --project seawolf-rides --only hosting
```

`firebase.json` serves `mobile/dist-web` with every path rewritten to `/index.html` (`web.output: "single"` in `mobile/app.json`), so links such as `/rides` load the app. `index.html` is sent with `Cache-Control: no-cache` so a new deploy shows up on the next visit; the content-hashed files under `/_expo` and `/assets` are cached for a year.

A production build that still points at the `demo-` project stops on load (`firebase.ts`), so a wrong `.env` fails loudly instead of showing demo data. The guest sign-in and the developer demo routes are not available in production builds.

The site is served at `https://seawolf-rides.web.app`. Firebase Auth allows that domain by default.

### 6.2 CI and automatic deploys

- The CI `Build (Expo export)` job runs `npm run build:web` next to the Android export, so a change that breaks the browser build fails CI.
- Optional later: on merge to `main`, deploy hosting with the official Firebase Hosting GitHub Action and a service account secret; on PRs, deploy a free preview channel and post its URL for reviewers.

## 7. Testing and acceptance

- Existing suites stay green: 479 mobile unit, 26 backend, emulator integration suites.
- New: CI web export; unit tests for the `confirm()` helper and payment URL fallbacks.
- Manual QA matrix before launch, one owner per row:

| Browser / device | Must pass |
|---|---|
| Safari on iPhone | Sign up + email verification, onboarding, find matches, send request, chat, accept, cancel |
| Chrome on Android | Same as above, plus location permission |
| Chrome and Safari on laptop | Sidebar layout, master-detail Rides and Inbox, keyboard navigation, dialogs |
| Two accounts at once | Request on one, accept on the other, both update live |

- **Done means:** a new commuter can go from the link to an accepted ride and a chat without help, on phone and laptop, with no console errors and no dead buttons.

## 8. Timeline to Dec 7 (Thanksgiving is Nov 26)

| Dates | Work | Suggested owner |
|---|---|---|
| Nov 18–20 | Web export spike, hosted mode switch, deploy backend and an unstyled web build to a preview URL | Kenny (platform), Gio (backend) |
| Nov 20–24 | Section 4 fixes: `confirm()`, maps on Leaflet, time input, auth persistence, payment and directions links | Justin (maps/routing), Gio |
| Nov 21–25 | Section 2–3 design: `WebShell`, sidebar, breakpoints, card spec, Next Trip card, onboarding card, master-detail Rides and Inbox | Ray (frontend) |
| Nov 25–28 | QA matrix, fixes, production deploy, budget alerts | Everyone |
| Nov 29–Dec 6 | Pilot with commuters, track the funnel, fix what blocks people | Everyone |
| Dec 7 | Poster: live URL, pilot numbers, what we learned | Everyone |

Owners follow the README's team roles and are suggestions for the team to confirm.

## 9. Test web build of `main` (Nov 18)

A clean copy of `main` (102ea66) was built with `npx expo export --platform web` and opened in a browser.

| Check | Result |
|---|---|
| `react-native-web` installed? | **No.** It is not in `mobile/package.json`; `npx expo install react-native-web` adds it. First task of the spike. |
| Web export compiles | **Yes.** Every route, including onboarding, commute setup, Account pages and the Rides / Inbox screens, bundled with no build errors. Main JS bundle about 1.1 MB. |
| App starts in a browser | **Stops before the first screen** with a clear error: the production build has no Firebase config, and `firebase.ts` deliberately refuses the `demo-` emulator project outside a development build. Expected, and fixed by building with the real `seawolf-rides` config (section 6). |
| Screens render / maps / alerts | **Not verified yet.** The build compiling does not mean map screens work: `react-native-maps` has no browser implementation, so those screens need the Leaflet replacement in section 4.1 regardless. |

Conclusion: the web build is close. The first real check is running `npx expo start --web` against the local emulators (development mode allows the demo project) and walking through every screen with the section 7 checklist.

## 10. Web spike results (branch `codex/web-spike`, Nov 18)

The app was run with `npx expo start --web` against the seeded local emulators (`node scripts/start-local-demo.mjs --live-osrm`, then `npm run seed:demo`) and exercised in a browser at 1280×800 and 375×812.

### Fixed in the spike

| Problem found | Fix |
|---|---|
| **Whole site crashed on load.** `react-native-maps` is imported at startup and has no browser build (`codegenNativeComponent is not a function`). | All 9 map files now import `src/map/nativeMaps`. Native resolves `nativeMaps.tsx` (re-exports `react-native-maps`); web resolves `nativeMaps.web.tsx`, a labelled "Map preview" placeholder with no-op camera methods. The base file must be `.tsx`, not `.ts`: Metro tries each extension in turn with platform variants first, so a `.ts` base beats a `.web.tsx` sibling. |
| Login session storage was native-only (`getReactNativePersistence(AsyncStorage)`). | `src/firebase/authPersistence.ts` (native) and `authPersistence.web.ts` (`browserLocalPersistence`). |
| `Alert.alert` does nothing in a browser, so 11 save / sign-out / unblock **error messages were silent**. All 11 are one-button messages. | `src/components/showAlert.ts` (native `Alert.alert`) and `showAlert.web.ts` (`window.alert` for now; a styled dialog later). |
| Departure and arrival times could not be changed: the native time picker has no web version. | `TimeField` renders `WebTimeInput` (`<input type="time">`, 5-minute steps) on web. Verified: setting 8:30 updates the pill. |
| `react-native-web` missing. | Added with `npx expo install react-native-web`. |

Three unit-test fakes were renamed to the new module paths (`chat-ui`, `profile-navigation`, `safety`).

### Verified working in the browser

Welcome screen; guest sign-in; Home with live trips, weekly view and "Needs you"; Rides with gas shares and carpools; Inbox; chat (message sent through `sendChatMessage` and shown); request details and **Accept request** (Jordan's return ride became a confirmed ride through `respondToRideRequest`); Account; the sign-out sheet (the app's own sheet, not a native alert); commute setup timing step with live OSRM estimates. At 375px wide the site looks like the phone app.

### Still to do (from what the spike showed)

- **Layout at desktop width:** everything stretches edge to edge, including the full-width red Next Trip card. Sections 2–3 (max width, sidebar, card spec, Next Trip restyle) are the next priority.
- **Maps:** replace the placeholder with Leaflet + OpenStreetMap.
- **Chat:** Enter inserts a new line instead of sending.
- **Not yet exercised:** onboarding from a new account, photo upload, location permission, Venmo/PayPal hand-off, directions hand-off.
- **Expo Doctor:** fails on `main` too (`expo`, `expo-constants`, `expo-dev-client` patch versions behind SDK 58's latest); unrelated to the web work but it will fail CI's doctor step until `npx expo install --fix` is run.

### Checks

`npx tsc --noEmit` clean · `npx expo lint` clean · 479/479 mobile unit tests · `npx expo export --platform web` and the Android export both succeed.

## 11. UI direction: what we take from Uber (research, Nov 18)

### 11.1 What Uber did

- **Uber's old desktop site was our exact problem.** In its 2019 write-up of the desktop booking redesign, Uber says the previous web version was the mobile site responsively "stretched" across large screens, which made it less attractive and harder to use. The fix was a change in philosophy: treat desktop as a first-class layout, not a bigger phone. ([Uber Engineering, 2019](https://www.uber.com/blog/web-booking-flow/))
- **Desktop mattered for adoption.** About 30% of Uber's mobile-web riders mainly booked on a computer, and letting people book a first trip on the web instead of installing the app raised first-trip conversions about 10% globally. Same argument as our web-first pilot. (same source)
- **The map is optional, and the flow works without it.** Uber moved the map on/off toggle up front and made the mapless flow the easy one: it asks where to be picked up and suggests nearby points instead of making people drag a pin. (same source; [m.uber, 2017](https://www.uber.com/blog/m-uber/))
- **Light and fast.** The original mobile-web app dropped custom fonts entirely and used inline SVG icons, relying on size and weight for hierarchy. ([m.uber, 2017](https://www.uber.com/blog/m-uber/))
- **One design language, components that adapt.** Uber's design system (Base, and Base Web for React) defines one set of components that resize per screen rather than separate mobile and web designs. ([Base Web](https://www.uber.com/blog/introducing-base-web))

### 11.2 What uber.com/ride looks like today (measured in a browser, Nov 18)

| | Desktop (1440 px) | Phone (375 px) |
|---|---|---|
| Navigation | Black top bar, 64 px tall: logo, section links, Log in / Sign up at right | Same bar, links collapse into a menu button |
| Page width | Content in a centered container (~1150 px, 144 px side margins) | Full width, 16 px margins |
| Layout | Two equal columns: task on the left, map on the right (576 × 576, 6 px corners) | One column; task first, map pushed down |
| Headline | 52 px, bold | Smaller, still bold |
| Form | Narrow column (~360 px), gray-filled inputs with no border | Inputs stretch to full width |
| Primary button | One solid black button that **hugs its text**, left-aligned | Same button, wider tap target |
| Secondary actions | Plain text links or **light gray filled** buttons, never outlined | Same |
| Lists | Icon + two lines of text + divider, not boxed cards | Same |
| Corners | Small (≈6–8 px) | Same |

### 11.3 Why our web screens look "funky"

From the spike screenshots and the component code:

| What looks off | Cause in our code |
|---|---|
| Buttons 1,200 px wide ("View ride", "Request a price change", "Review 2 requests") | `AppButton` always fills its parent; nothing caps it on wide screens |
| Red outlined boxes everywhere | `AppButton` secondary = white fill + 1 px red border; on desktop every secondary action becomes a long red frame |
| Giant red Next Trip banner | `NextTripCard` uses `colors.accent` as its background and stretches edge to edge |
| Cards feel bubbly and stretched | `Card` uses 20 px corners and full-width boxes for every list item |
| Phone tab bar along the bottom of a laptop screen | `BottomTabBar` is used at every width |
| Popups slide up from the bottom across the full width | Bottom sheets used as-is on desktop |
| Chat bubbles at the far edges, composer 1,200 px wide | No max width on the conversation |

### 11.4 What we change (keeps our colors)

**Principle: same screens and flows, two layouts.** Below 768 px the site stays the phone app. At 1024 px and up it gets a desktop layout, like uber.com.

1. **Top navigation bar on desktop** (replaces the left-sidebar idea in section 3.1, to match Uber and keep more width for content). 64 px, white with a bottom border; Seawolf Rides wordmark left; Home · Rides · Map · Inbox · Account; avatar menu at right. Active item: dark text with a 2 px red underline. Under 768 px: bottom tab bar as today.
2. **Centered page container**: max 1,200 px, 48 px side padding on desktop, 16 px on phones.
3. **Task + map split** for Home, Rides detail and Map: left column ~480 px for the task (next trip, requests, list); right column for the map in a rounded panel. When the map is unavailable (as now on web), the right column shows the trip summary, so the page never depends on the map, as Uber's mapless flow did.
4. **Buttons** (`AppButton`):
   - Desktop: width hugs the label (min 120 px, 44 px tall), left-aligned, grouped in a row. Phone: full width as today.
   - Primary: solid red (`accent`), white text; one per view.
   - Secondary: **light gray fill (`surfaceMuted`), dark text, no border**, instead of the red outline.
   - Tertiary: red text link, no box ("View public profile", "Clear time").
   - Destructive: red text or outline only inside confirm dialogs.
5. **Next Trip card**: white card, small red "NEXT TRIP" label, dark headline, compact detail row, one red "View ride" button that hugs its text. No red background.
6. **Lists instead of boxed cards**: Inbox threads, carpools, gas shares and requests become rows (avatar or icon · two text lines · trailing value or chevron) separated by 1 px dividers inside one white panel. Boxed cards are kept only for the next trip, a selected trip and stats.
7. **Smaller corners on web**: 8 px for buttons and inputs, 12 px for panels (phone keeps current radii).
8. **Inputs**: gray-filled (`surfaceMuted`) with no border, 8 px corners, red 2 px focus ring.
9. **Dialogs not sheets on desktop**: request details, calendar and match results open as a right-side panel (420 px) or centered dialog (≤ 560 px); bottom sheets stay on phones.
10. **Headlines**: page title 40 px bold on desktop (Uber uses 52 px on marketing pages; 40 suits an app), 28 px on phones. Keep the system font (no font download), like m.uber.
11. **Hover and focus**: rows and buttons darken slightly on hover; visible focus ring for keyboard users.

### 11.5 Build order

1. Shared pieces: `useBreakpoint`, `PageContainer`, `TopNav`, new `AppButton` variants and sizing, `ListRow`, web radii. Changing these fixes most screens at once.
2. Home (Next Trip restyle + split layout), Inbox (two-pane), Rides (list + detail).
3. Request details and calendar as side panels on desktop.
4. Real web map in the right column.

Screens are checked at 375, 768 and 1440 px after each step.
