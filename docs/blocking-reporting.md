# User Blocking and Safety Reporting

This document defines the architecture, Firestore security rules, client interfaces, and matching filters for the user blocking and reporting system in Seawolf Rides.

---

## 1. Safety Goals

- **Commuter Safety & Trust:** Commuters can report misconduct, harassment, unsafe driving, scams, or no-shows directly from within the app.
- **Harassment Prevention:** Users can immediately block an individual. Once blocked, the blocked user is permanently excluded from matching recommendations, cannot send ride requests, and cannot message the blocker.
- **Privacy & Protection:** Submitted reports are strictly confidential. No client can read, update, or enumerate reports in Firestore; only verified Stony Brook users can submit new reports. Users cannot view or query another commuter's blocked list.

---

## 2. Firestore Collections & Security Rules

### `users/{userId}/blockedUsers/{targetId}`
Stores users blocked by `userId`.
- **Read & Delete:** Allowed only by the owning user (`owns(userId)`).
- **Create & Update:** Allowed only by the owning user with validated schema:
  - `targetId`: String, must match document ID and cannot equal `userId` (users cannot block themselves).
  - `targetName`: String (1–80 chars), cached display name for UI display.
  - `createdAt`: Timestamp.

### `reports/{reportId}`
Stores submitted incident and safety reports for administrative review.
- **Create:** Allowed by any verified Stony Brook student (`isVerifiedStonyBrookUser()`) with validated schema:
  - `reporterId`: String, must match `request.auth.uid`.
  - `targetId`: String, target user's ID, must not equal `reporterId`.
  - `targetName`: String (1–80 chars).
  - `reason`: One of `'harassment'`, `'unsafe_driving'`, `'no_show'`, `'inappropriate_behavior'`, `'scam_or_fraud'`, `'other'`.
  - `details`: Optional string (up to 500 chars).
  - `createdAt`: Timestamp.
- **Read, Update, Delete:** Disallowed for all client contexts (`allow read, update, delete: if false;`).

---

## 3. Backend Enforcement

- **Calendar Matching (`findCommuteMatches`):**
  - Caller's blocked list (`users/{uid}/blockedUsers`) is loaded prior to candidate evaluation.
  - Candidate discovery filters out all blocked commuters.
  - When loading candidate participants, any candidate who has blocked the requesting caller is also filtered out (`snapshots[5]?.exists`).
- **Ride Requests (`createRideRequest` / `prepareCalendarPair`):**
  - Checks mutual block status via `areUsersMutuallyBlocked(riderId, driverId)`.
  - Throws `failed-precondition` if either party has blocked the other.
- **Messaging (`startMatchChat` / `sendChatMessage`):**
  - Checks mutual block status before starting conversations or sending messages.
  - Throws `permission-denied` if either participant is blocked.

---

## 4. User Interface Integration

1. **Public Profile (`/profile/[participantId]`):**
   - Displays a "Safety & trust" card when viewing another commuter's profile.
   - **Block User:** Opens confirmation sheet explaining that matches, profile details, and messages will cease. Toggles to "Unblock" if currently blocked.
   - **Report Commuter:** Opens a modal allowing selection of standard report reasons with optional details input.
2. **Conversation Screen (`/inbox/[chatId]`):**
   - Direct link to partner's public profile from header.
   - Shows banner notice and prevents sending messages if the commuter has been blocked.
3. **Account Settings (`/account` & `/account/blocked`):**
   - Under "Safety & privacy", taps on "Blocked people" navigate to `/account/blocked`.
   - Displays full list of blocked users with avatar, display name, date blocked, and a one-tap "Unblock" button.
