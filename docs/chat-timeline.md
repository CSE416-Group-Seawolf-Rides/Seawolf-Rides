# Ride and price requests in the conversation

A pair of people keeps one chat. New ride requests and price-change proposals
append typed entries to its existing `messages` collection, between ordinary
texts. Each entry has a stable ID, original `sentAt`, and shared `sequence`.
Status changes update the card's contents in place, without changing its order.

- A `RIDE_REQUEST` stores the shared ride snapshot, including its proposal
  `attemptId`. Its status and agreed amount follow acceptance, decline,
  cancellation, price approval, and settlement. Completed is derived from both
  agreed arrival times.
- A `PRICE_CHANGE` additionally stores its own proposal and original amounts.
  The recipient can accept/reject and the sender can withdraw. Every later
  proposal gets another entry. Rejecting a proposal leaves the ride booked.
- Cancellation and settlement expire an unanswered price proposal in the same
  transaction that updates the ride. Cancellation reasons remain chat messages.

Creation and replies use backend transactions and the existing participant-only
rules. Retry identifiers prevent duplicate cards; concurrent texts and requests
share the same thread counter. No exact pickup coordinates are copied into chat.

The client orders by the shared `sequence`, so later requests always append after earlier conversation entries. It keeps the conversation mounted
by account/chat ID, retains drafts, and follows incoming entries only while the
reader is already near the bottom. Each card opens its own ride/attempt, even if
the thread now refers to another date. Replaced attempts open read-only snapshots
and cannot act on the replacement.

Only future ride requests and price proposals create cards. Opening a chat never
scans old rides or reconstructs past cards. A new price proposal on an older ride
adds just that proposal's card. Existing text history stays intact.

Ride cards reuse the original “You sent a request” / “[Name] sent you a request”
context card design, with an independent status and View request button. The first
card stays at the start of its history; each subsequent card stays where it was
created. The latest thread context is not rendered as a moving request header.

Cancelling a pending request updates its own card and appends one dated
cancellation notice atomically. A second pending request stays untouched.
Cancellation retries do not duplicate the notice. Accepted-ride cancellations
also send the required reason and expire pending price proposals.

Restart the local backend to load the updated callables. Tests cover order,
shared card design, historical details, draft/scroll preservation, proposal
permissions, retries, resends, independent pending cancellations, settlement,
no backfill, and exported chat history.
