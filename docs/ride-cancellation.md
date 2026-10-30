# Cancelling a confirmed ride

Either the driver or rider can cancel one confirmed, unpaid ride until its agreed
arrival is complete. Open **Trip details**, a dated trip in **Your carpools**, or
the trip details from chat or matching results. The red **Cancel Ride** button is
at the bottom of those details.

The button opens a sheet titled **Are you sure?**. A reason is required (up to 500
characters). **Keep ride** dismisses it without changes. **Yes, Cancel Ride** saves
the cancellation; if the request fails, the sheet preserves the reason for retry.

`cancelAcceptedRide` derives the caller from Auth and verifies they are the stored
driver or rider. The proposal's `attemptId` prevents an old screen or delayed
retry from cancelling a replacement proposal. No route lookup is required.

One Firestore transaction:

- Changes the ride to `CANCELLED`, recording `cancellation.cancelledBy`, `reason`,
  and `cancelledAt`.
- Releases both `_rideCommitments` entries, verifying neither belongs to another
  ride, and removes the shared exact pickup snapshot.
- Expires any unanswered price-change proposal.
- Adds one dated cancellation message and reason to the pair's private chat,
  updating its preview without replacing a newer trip's chat context.

Both clients receive the status through the existing ride listener. The ride
leaves current carpools, calendar reservations, and gas-share balances, while its
reason remains in history and chat. Other dated rides remain booked. Duplicate
confirmations return the original cancellation without duplicating messages or
deleting a replacement ride's reservation.

Completed/paid rides cannot be cancelled. Pending requests retain their separate
sender-only **Cancel request** flow. All client writes remain denied; the existing
environment and authentication restrictions on ride callables still apply.

Restart the backend after updating it so it loads the `cancelAcceptedRide`
callable. No migration is needed for existing ride records.

Regression coverage includes `ride-cancellation.test.mjs`,
`ride-cancellation-ui.test.mjs`, and `integration/ride-cancellation.integration.mjs`
(included in `npm run test:matching`). The callable suite uses isolated emulator
accounts and never changes manual test accounts.
