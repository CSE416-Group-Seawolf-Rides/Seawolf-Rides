import { collection, query, where, type Firestore } from 'firebase/firestore';

// Load the participant's complete local-demo history so old documents cannot
// displace future trips. Firestore rules still require the authenticated participant.
export function participantRequestsQuery(database: Firestore, uid: string) {
  return query(
    collection(database, 'rideRequests'),
    where('participantIds', 'array-contains', uid),
  );
}
