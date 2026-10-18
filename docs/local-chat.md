# Local demo chat

The existing conversation/bubble UI now has a real shared Inbox. This remains **demo-seawolf-rides emulators only**: no cloud Functions deployment, billing, or external messaging service.

## Demonstration

1. Stop backend/Expo and wait for emulator export before pulling the updated PR branch. Restart the usual local backend (`--traffic-eta` with the private TomTom environment, or `--live-osrm`) and Expo launchers. Both clients must use the same Mac LAN host/demo project and persisted emulator dataset. Restarting the backend also loads the new callables and Firestore rules.
2. Rider or driver selects an inbound date, finds a real potential match, and taps **Send chat** on that person's card or View more sheet. No ride request or acceptance is required to chat; vehicle completion is still required for driving requests/acceptance, not conversation.
3. The conversation opens with the other person's real saved first name. Enter a message and tap **Send**. The recipient opens **Inbox**, selects the conversation, and replies from their separate account/client. Both screens stream persisted messages.
4. Return to Inbox to reopen it. Empty conversations stay out of the Inbox until the first message. Conversations are reused for the same two people across dates and Driving/Riding/Either arrangements; the header says which date/campus originally started the conversation.
5. Stop backend with Ctrl+C and wait for export, restart with the same `.local-demo-data`, then reopen Inbox. Auth accounts, conversations, and messages return through the existing export/import process. Signing out or reinstalling Expo does not delete the shared backend history.

Chat does not reserve a seat, accept a ride, change saved schedule/times, or automatically share exact pickup coordinates. A street address typed by a participant is their message; the application does not insert private locations. Confirming or changing a ride still requires the supported ride actions.

## API and access

- `startMatchChat({driverId,riderId,driverRevision,riderRevision,localDate})`: verified campus caller must be one of two different participants. New conversations reuse `prepareCalendarPair()` and the canonical evaluator, current eligibility/discovery/schedule/revisions, and the shared bounded routing scheduler/cache. A transaction rechecks the prepared input snapshots before creating the thread. Infeasible, unknown, opted-out, or changed inputs cannot create a new conversation. No alternative compatibility evaluator is added.
- Threads use a hash of sorted participant IDs: simultaneous/crossed starts reuse one conversation. Existing conversations can be reopened after commute changes or acceptance without rerouting. Both accounts must remain eligible to initiate or send; opting out of future matching does not delete an existing conversation.
- `sendChatMessage({chatId,messageId,text})`: verified participant only, 1–2,000 non-whitespace characters, plain text. Server assigns sender/time and transactionally increasing sequence; client cannot forge another sender. A retained message ID makes retries idempotent. Reusing an ID with different text/sender fails. Retries after navigating away/reloading may use a new ID; check history before resending a message whose outcome was uncertain.
- `/chats/{id}` contains participant IDs/names, original date/campus context, last-message summary, count, and server times. `/chats/{id}/messages/{messageId}` contains sender/text/time/sequence. Neither contains matching inputs or exact coordinates. Verified participants alone can read; all client writes are denied. Messages and summaries are written only by the local trusted backend.
- Inbox queries constrain `participantIds` to the signed-in UID. Conversations listen to the latest 50 messages in sequence order; **Load earlier messages** expands history by 50. Sequence ordering remains deterministic when two users send simultaneously. Errors retain the draft and permit retry; this is not an offline send queue.

Push notifications, unread badges/read receipts, attachments, blocking/reporting, message deletion, and chat-driven trip amendments are not part of this demonstration. Both clients must connect to the local backend to receive live updates.

## Verification

The two-account fake-router emulator suite checks pre-request creation, self/third-party/stale/incompatible/opted-out rejection, crossed starts, real-time delivery to both accounts, concurrent sequencing, duplicate retries, participant-only reads/actions, denied direct writes, Inbox queries, and no routing calls when messaging. The export/import check re-authenticates both users and reads the persisted conversation and ordered messages after a backend restart. Cloud resources and the user's actual demo dataset are not used by these tests. Physical-device keyboard layout, tapping Send chat through the match sheets, and live delivery on two devices still require the manual walkthrough above.
