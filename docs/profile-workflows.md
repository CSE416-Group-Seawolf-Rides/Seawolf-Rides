# Live public profiles and matching compatibility

Profile details are edited through `saveProfileDetails`. This transaction reads
`users/{uid}` for the authoritative commute role and replaces only
`publicProfiles/{uid}` with the validated name, photo, bio, and role. It does not
rewrite private account or commute documents. Removing optional details removes
them from the public document.

`loadUserData` overlays valid published details on the legacy private profile.
Private role remains authoritative, including when an editor was opened before
a role change. Missing or malformed public documents fall back to the existing
private profile. Account/role onboarding saves still update the private account
and matching inputs together.

Backend matching reads the published display name but retains the original
calendar revision calculation over private account, commute, and day documents.
This preserves the revision format on existing pending requests: editing a bio,
photo, or display name cannot invalidate them. Actual commute, role, or day edits
still invalidate stale requests. No migration or security-rule changes are needed
beyond the public-profile rules introduced by PR #19.

The live chat header opens `/profile/[participantId]`. Matches expose a profile
link in both the results list and detail sheet. Request cards, carpool cards,
accepted ride details, and chat trip details link to the same Firebase-backed
page. Native sheets finish dismissing before navigation. Profile presses stop
propagation so a surrounding ride card does not open a different screen.
Conversation keys and message listeners remain unchanged when viewing a profile.

Regression coverage includes the real callable flow from pending request through
cosmetic edits to acceptance, unchanged private document versions, updated match
names, reloaded/removed details, preservation of newer commutes, and rejection
after a real role change. Rendering checks cover live navigation, both ride
participants, iOS sheet dismissal ordering, and profile listener target changes.
