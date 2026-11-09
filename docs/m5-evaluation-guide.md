# Evaluator & Grader Walkthrough Guide — Milestone 5

This guide provides instructors and teaching assistants with a clean, reproducible procedure to run, evaluate, and grade the Seawolf Rides platform.

---

## 1. Quick Start (5 Minutes)

### Prerequisites
- **Node.js 24.21.0** (matches `.nvmrc`)
- **Java 21+** (for Firebase Local Emulator Suite)
- **Expo Go** app on an iOS or Android physical device (or Android Studio emulator)

### Step 1: Install Dependencies
```bash
git checkout main
cd mobile && npm ci
cd ../functions && npm ci
cd ..
```

### Step 2: Start Local Firebase Emulators (Terminal 1)
```bash
npx firebase-tools emulators:start --config firebase.demo.json --project demo-seawolf-rides --only auth,firestore,functions
```
*Emulators will start on ports 9099 (Auth), 8080/9095 (Firestore), and 5001 (Functions).*

### Step 3: Seed Test Accounts & Rides (Terminal 2)
```bash
npm run seed:demo --prefix mobile
```
*This command resets and populates test student accounts, bidirectional commutes, pending/accepted carpools, mutual amendments, and in-app chat history.*

### Step 4: Start Expo Mobile App (Terminal 2)
```bash
cd mobile
npx expo start --lan
```
Scan the terminal QR code using **Expo Go** on your iOS or Android phone.

---

## 2. Pre-Seeded Test Accounts

All accounts use the standard password: **`seawolf-demo-2026`**

| Student Name | Stony Brook Email | Role | Vehicle / Seats | Starting Location |
|---|---|---|---|---|
| **Wolfie Seawolf** | `demo@stonybrook.edu` | Driver | Red Honda Civic (3 seats) | Smithtown |
| **Maya Lin** | `maya@stonybrook.edu` | Rider | N/A | Lake Ronkonkoma |
| **Jordan Miller** | `jordan@stonybrook.edu` | Rider | N/A | Centereach |
| **Alex Chen** | `alex@stonybrook.edu` | Rider | N/A | Stony Brook Station |
| **Chris Park** | `chris@stonybrook.edu` | Rider | N/A | Port Jefferson |
| **Sam Taylor** | `sam@stonybrook.edu` | Driver | Silver Toyota RAV4 (4 seats) | Nesconset |

---

## 3. Step-by-Step Grading Verification Checklist

### Test Scenario A: Commute Calendar & Directional Parity
1. Sign in as **`demo@stonybrook.edu`** (Wolfie).
2. Go to the **Calendar** tab.
3. Switch between **To Campus (Morning)** ☀️ and **Return Home (Evening)** 🌙 using the segmented pill bar.
4. Verify that per-day status overrides can be toggled between `Drive`, `Ride`, `Either`, and `Skip`.

### Test Scenario B: Multi-Request Swipeable Carousel
1. Navigate to the **Rides** tab.
2. Under "Needs you", tap **Review requests**.
3. Verify the **Swipeable Horizontal Pager**:
   - Swipe left/right or tap **Prev** / **Next** to compare candidates (e.g. Alex vs. Jordan).
   - Observe pagination indicators (`● ○`).
4. Tap **Accept request** on an applicant:
   - Notice the driver's available seats decrement atomically.
   - Verify that double-booking is impossible due to atomic Firestore transaction locks.

### Test Scenario C: Mutual Trip Amendments & In-App Chat
1. Open the **Inbox** tab and select the conversation with **Maya**.
2. Notice the real-time chat messages and in-thread trip cards.
3. Tap **Propose trip change** (or inspect pending amendment):
   - Select a time chip (e.g., `+10 min` or `+15 min`).
   - Counter-proposals update live in the conversation sheet without navigating away.
4. Accept the amendment: departure time updates synchronously across both accounts.

### Test Scenario D: Turn-by-Turn Road Route Preview & Maps Handoff
1. In the **Rides** tab, open a confirmed trip.
2. Scroll to **Your trip route**:
   - Observe the multi-stop road geometry generated via OSRM (`Start ➔ Pickup ➔ Campus Drop-off`).
   - Check the road metrics: actual driving distance (km) and estimated duration.
3. Tap **Directions**:
   - The app deep-links directly into **Apple Maps** or **Google Maps** with ordered waypoints.

### Test Scenario E: Non-Commercial Gas Sharing & Peer Settlement
1. Inspect the gas contribution breakdown card:
   - Base pickup fee ($1.00) + shared mileage + detour allowance.
2. Verify that peer settlement recording options (Venmo, PayPal, Zelle, Cash) allow confirming receipt without commercial payment processing.

### Test Scenario F: Trust, Privacy & Account Safety
1. Go to the **Account** tab.
2. Open **Emergency Contact**: add or view a contact, and verify one-tap Call/Text actions.
3. Open **Report a problem**: submit a test report and confirm a reference number is issued.
4. Open a commuter's profile: verify that exact residential coordinates are hidden behind a 2-mile privacy area.

### Test Scenario G: In-Car Navigation Playback (Android Auto / CarPlay)
Run the automated car navigation playback script:
```bash
npm run car:demo --prefix mobile
```
Observe the GPS maneuver advances, turn-by-turn icon updates, and ETA countdown.

---

## 4. Automated Test Suite Verification

Run all test suites from the repository root:

```bash
# 1. Run complete mobile unit test suite (479 tests)
npm test --prefix mobile

# 2. Run backend functions test suite (26 tests)
npm test --prefix functions

# 3. Run TypeScript type-check across client
npm run typecheck --prefix mobile

# 4. Run ESLint code checks
npm run lint --prefix mobile
```
**Expected Result:** 100% passing across all 505 tests with zero compilation errors.
