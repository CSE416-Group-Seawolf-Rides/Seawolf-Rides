# Account safety and support

Account uses the existing settings rows, cards, colors and typography. New routes are
`/account/emergency-contact`, `/account/help`, `/account/report-problem`,
`/account/legal`, `/account/terms` and `/account/privacy-policy`.

## Emergency contacts

One optional contact lives in `users/{uid}/safety/emergencyContact`: `schemaVersion`,
`name`, normalized international `phone`, optional-in-UI `relationship` (stored as
an empty string when omitted), and a server `updatedAt` timestamp. Only the verified
account owner can read, save or remove it. It is never written to public profiles,
chats or commute documents. Cosmetic/contact edits do not change ride revisions.

Call and Text open the device’s own apps. There is no automatic messaging, emergency
dispatch, live monitoring or trip sharing. Removal requires confirmation. Writes
show success only after server acknowledgement; a UI timeout retains the original
operation for retry rather than racing a second write.

## Reviewing problem reports

Use the **same Firebase project/environment the user submitted to**:

1. In hosted Firebase Console, open **Firestore Database → Data → supportReports**.
   For local testing use the running Firestore Emulator UI instead. Local reports
   stay local and are included in the existing emulator export; they do not appear
   in the hosted project.
2. Find a report by its document ID. The user’s reference is `SR-` followed by that ID.
3. Review `category`, `description`, `reporterId`, `createdAt`, `appVersion` and
   `platform`. New reports have `status: NEW`.
4. Authorized project administrators may set `status` to `IN_PROGRESS` or `RESOLVED`
   using console/backend access and add a private `internalNote`. There is no
   app-based administrator role, automatic assignment, email notification or live
   support chat in this version. The team must check the queue manually.

The create-only client schema is strict. Verified Stony Brook accounts may submit
their own reports; clients cannot read, list, edit or delete them, even their own.
Console access must be limited to the project team through Firebase/Google Cloud
permissions. Do not grant users broad read access to expose a report status.

Problem reports are separate from commuter misconduct in `reports`. The app does
not automatically attach photos, conversation history, addresses or precise route
coordinates. Do not copy those records into support notes unless required to
investigate and appropriately authorized. Submitting or retrying a queued report
does not generate another reference within the same form.

## Account and privacy requests

Users contact the team through **Report a problem → Account or privacy**. There is
no invented support email or automatic deletion promise. Review the report using
the authenticated `reporterId`, verify any follow-up request, and track the action
in internal notes. For deletion, inspect the person’s Auth account, private
subcollections, public profile, payment handles, shared rides/conversations and any
outstanding disputes before removing data. Record what was removed and any shared
records retained; deleting only the top-level user document does not remove nested
Firestore documents or the Auth identity. No retention period or automatic expiry
job is claimed by the current policy.

The Help Center is searchable and uses expandable answers. Policy documents have
explicit version/date metadata and describe the implemented data flows, including
local emulator exports, routing providers and manual support. Before a public
release, the project team should review the terms, privacy copy, retention process
and any changed provider configuration together. These pages do not record a new
terms-acceptance event or add a signup consent flow.

## Deployment and verification

Deploy `firestore.rules` with the app to enable the two new storage paths in hosted
Firebase. Merging a PR does not deploy rules. For a local manual backend, load the
new rules through its usual controlled restart; preserve its export. This change
does not start, stop or seed the developer’s backend.

`mobile/integration/account-support.integration.mjs` tests real repository writes,
read-back/removal, owner isolation, verified-account requirements, strict schemas,
server timestamps, immutable private reports, administrator review and unchanged
ride-validation documents. Run it only against a disposable Firestore emulator,
never against manual-test ports or data.
