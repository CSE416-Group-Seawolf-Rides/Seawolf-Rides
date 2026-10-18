import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { commuteKey } from '../src/mvp/settings.ts';
export async function saveMatchingFixture(
  client,
  mode,
  weekday,
  seatsRequested = 1,
  revision = 'v1',
) {
  const commute = {
    schemaVersion: 1,
    ownerId: client.uid,
    startArea: {
      center: { latitude: 40.9, longitude: -73.1 },
      radiusMiles: 2,
      label: 'Stony Brook area',
    },
    campusLot: 'westSide',
    days: [
      {
        day: weekday,
        mode: mode === 'driver' ? 'drive' : 'ride',
        arriveBy: 540,
        leaveAt: null,
      },
    ],
    ...(mode === 'driver' ? { seats: 2 } : {}),
  };
  const setup = {
    schemaVersion: 1,
    ownerId: client.uid,
    revision,
    commuteKey: commuteKey(commute),
    mode,
    active: true,
    optIn: true,
    campusLot: 'westSide',
    weekdays: [weekday],
    pointId: 'stony-brook-station',
    startWindow: { earliest: mode === 'driver' ? 460 : 480, latest: 510 },
    arrivalWindow: { earliest: 480, latest: 540 },
    seatsRequested,
    maxDetourSeconds: 600,
    maxExtraRideSeconds: 900,
    accessWalkSeconds: 0,
    egressWalkSeconds: 0,
    maxAccessWalkSeconds: 300,
    maxEgressWalkSeconds: 300,
  };
  await setDoc(doc(client.db, 'users', client.uid), {
    schemaVersion: 1,
    firstName: client.uid,
    role: mode,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(client.db, 'users', client.uid, 'commutes', 'primary'), {
    ...commute,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(client.db, 'matchingSetups', client.uid), {
    ...setup,
    updatedAt: serverTimestamp(),
  });
  return setup;
}
