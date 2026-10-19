import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, disableNetwork, doc, enableNetwork, getDoc, getDocFromCache, serverTimestamp, setDoc } from 'firebase/firestore';

import { buildCommuteSchedule, toPrivacyArea } from '../src/commute/commuteModel.ts';
import { loadUserData, savePrimaryCommute, saveUserData } from '../src/persistence/userDataRepository.ts';
import { SaveCoordinator, SavePendingError } from '../src/persistence/saveCoordinator.ts';

const projectId = 'demo-seawolf-rides';
let environment;

const verifiedStonyBrookToken = {
  email: 'wolfie@stonybrook.edu',
  email_verified: true,
};

function authenticatedUser(uid, token = verifiedStonyBrookToken) {
  return environment.authenticatedContext(uid, token).firestore();
}

const profile = {
  schemaVersion: 1,
  firstName: 'Wolfie',
  role: 'both',
  updatedAt: Timestamp.now(),
};

const commute = {
  schemaVersion: 1,
  ownerId: 'wolfie',
  startArea: {
    center: { latitude: 40.86, longitude: -73.08 },
    radiusMiles: 2,
    label: 'Centereach area',
  },
  campusLot: 'tabler',
  days: [{ day: 'mon', mode: 'ride', arriveBy: 540, leaveAt: 1020 }],
  seats: 3,
  updatedAt: Timestamp.now(),
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
});

after(async () => {
  await environment.cleanup();
});

test('only the authenticated owner can read or write a profile', async () => {
  const owner = authenticatedUser('wolfie');
  const otherUser = authenticatedUser('seawolf', {
    email: 'seawolf@stonybrook.edu',
    email_verified: true,
  });
  const guest = environment.unauthenticatedContext().firestore();
  const ownerProfile = doc(owner, 'users/wolfie');

  await assertSucceeds(setDoc(ownerProfile, profile));
  await assertSucceeds(getDoc(ownerProfile));
  await assertFails(getDoc(doc(otherUser, 'users/wolfie')));
  await assertFails(getDoc(doc(guest, 'users/wolfie')));
  await assertFails(setDoc(doc(otherUser, 'users/wolfie'), profile));
});

test('unverified and non-Stony Brook accounts cannot access user data', async () => {
  const verifiedOwner = authenticatedUser('wolfie');
  const unverifiedOwner = authenticatedUser('wolfie', {
    email: 'wolfie@stonybrook.edu',
    email_verified: false,
  });
  const outsideOwner = authenticatedUser('wolfie', {
    email: 'wolfie@example.com',
    email_verified: true,
  });
  const lookalikeDomainOwner = authenticatedUser('wolfie', {
    email: 'wolfie@stonybrook.edu.example.com',
    email_verified: true,
  });
  const profilePath = 'users/wolfie';

  await assertSucceeds(setDoc(doc(verifiedOwner, profilePath), profile));
  await assertFails(getDoc(doc(unverifiedOwner, profilePath)));
  await assertFails(getDoc(doc(outsideOwner, profilePath)));
  await assertFails(getDoc(doc(lookalikeDomainOwner, profilePath)));
  await assertFails(setDoc(doc(unverifiedOwner, profilePath), profile));
  await assertFails(setDoc(doc(outsideOwner, profilePath), profile));
  await assertFails(setDoc(doc(lookalikeDomainOwner, profilePath), profile));
});

test('commutes are owner-only and must keep the matching owner id', async () => {
  const owner = authenticatedUser('wolfie');
  const otherUser = authenticatedUser('seawolf', {
    email: 'seawolf@stonybrook.edu',
    email_verified: true,
  });
  const ownerCommute = doc(owner, 'users/wolfie/commutes/primary');

  await assertSucceeds(setDoc(ownerCommute, commute));
  await assertSucceeds(getDoc(ownerCommute));
  await assertFails(getDoc(doc(otherUser, 'users/wolfie/commutes/primary')));
  await assertFails(setDoc(ownerCommute, { ...commute, ownerId: 'seawolf' }));
});

test('saved morning times are validated while legacy commutes remain readable', async () => {
  const owner = authenticatedUser('wolfie');
  const ref = doc(owner, 'users/wolfie/commutes/primary');
  const withStart = (startAt) => ({ ...commute, days: [{ ...commute.days[0], startAt }] });
  await assertSucceeds(setDoc(ref, commute));
  await assertSucceeds(setDoc(ref, withStart(450)));
  assert.equal((await getDoc(ref)).data().days[0].startAt, 450);
  await assertSucceeds(setDoc(ref, withStart(540)));
  await assertSucceeds(setDoc(ref, withStart(569)));
  await assertFails(setDoc(ref, { ...withStart(550), days: [{ ...commute.days[0], startAt: 550, leaveAt: 545 }] }));
  for (const invalid of [-1, 1440, 450.5, Infinity, NaN, 570, 600, '450']) {
    await assertFails(setDoc(ref, withStart(invalid)));
  }
});

test('the persistence repository round-trips an owner profile and primary commute', async () => {
  const owner = authenticatedUser('wolfie');
  const domainProfile = { firstName: 'Wolfie', role: 'both' };
  const domainCommute = {
    startArea: toPrivacyArea(
      { latitude: 40.8646, longitude: -73.0818 },
      'Centereach area',
    ),
    campusLot: 'tabler',
    days: [{ day: 'mon', mode: 'ride', arriveBy: 540, leaveAt: 1020 }],
    seats: 3,
  };

  await saveUserData(owner, 'wolfie', domainProfile, domainCommute);

  assert.deepEqual(await loadUserData(owner, 'wolfie'), {
    profile: domainProfile,
    commute: domainCommute,
  });
});

test('changing from driver to rider removes stored seats and reloads the updated role and commute', async () => {
  const owner = authenticatedUser('wolfie');
  const draft = {
    startArea: toPrivacyArea({ latitude: 40.8646, longitude: -73.0818 }, 'Centereach area'),
    campusLot: 'tabler',
    days: [{ day: 'mon', mode: 'drive', arriveBy: 540, leaveAt: 1020 }],
    seats: 6,
  };
  await saveUserData(owner, 'wolfie', { firstName: 'Wolfie', role: 'driver' }, buildCommuteSchedule(draft, 'driver'));

  const riderProfile = { firstName: 'Wolfie', role: 'rider' };
  const riderCommute = buildCommuteSchedule(draft, 'rider');
  await saveUserData(owner, 'wolfie', riderProfile, riderCommute);

  // Read through a fresh client as well as directly from the saved document.
  assert.deepEqual(await loadUserData(authenticatedUser('wolfie'), 'wolfie'), {
    profile: riderProfile,
    commute: {
      startArea: riderCommute.startArea,
      campusLot: riderCommute.campusLot,
      days: riderCommute.days,
    },
  });
  const snapshot = await getDoc(doc(owner, 'users/wolfie/commutes/primary'));
  assert.equal(Object.hasOwn(snapshot.data(), 'seats'), false);
});

test('saving an edited commute removes omitted seats without changing the profile', async () => {
  const owner = authenticatedUser('wolfie');
  const domainProfile = { firstName: 'Wolfie', role: 'both' };
  const driverCommute = {
    startArea: toPrivacyArea({ latitude: 40.8646, longitude: -73.0818 }, 'Centereach area'),
    campusLot: 'tabler',
    days: [{ day: 'mon', mode: 'drive', arriveBy: 540, leaveAt: 1020 }],
    seats: 6,
  };
  await saveUserData(owner, 'wolfie', domainProfile, driverCommute);

  const { seats: _seats, ...withoutSeats } = driverCommute;
  const edited = { ...withoutSeats, days: [{ ...driverCommute.days[0], mode: 'ride' }] };
  await savePrimaryCommute(owner, 'wolfie', edited);

  assert.deepEqual(await loadUserData(authenticatedUser('wolfie'), 'wolfie'), {
    profile: domainProfile,
    commute: edited,
  });
  const snapshot = await getDoc(doc(owner, 'users/wolfie/commutes/primary'));
  assert.equal(Object.hasOwn(snapshot.data(), 'seats'), false);
});

test('an offline save times out for the UI and applies once after reconnecting', async () => {
  const owner = authenticatedUser('wolfie');
  const coordinator = new SaveCoordinator(100);
  const domainProfile = { firstName: 'Wolfie', role: 'rider' };
  let completion;
  let applied = 0;

  await disableNetwork(owner);
  try {
    await assert.rejects(coordinator.run('profile', () => {
      completion = saveUserData(owner, 'wolfie', domainProfile, null).then(() => {
        applied += 1;
      });
      return completion;
    }), SavePendingError);

    assert.equal(applied, 0);
    const cached = await getDocFromCache(doc(owner, 'users/wolfie'));
    assert.equal(cached.metadata.hasPendingWrites, true);

    await enableNetwork(owner);
    await completion;
    assert.equal(applied, 1);
    assert.deepEqual(await loadUserData(authenticatedUser('wolfie'), 'wolfie'), {
      profile: domainProfile,
      commute: null,
    });
  } finally {
    await owner.terminate();
  }
});

test('the M2 sample stays publicly readable while other top-level commutes are denied', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'commutes/sample-commute-001'), {
      approximateArea: 'Centereach area',
    });
    await setDoc(doc(context.firestore(), 'commutes/private'), { ownerId: 'wolfie' });
  });

  const guest = environment.unauthenticatedContext().firestore();
  const sample = await assertSucceeds(
    getDoc(doc(guest, 'commutes/sample-commute-001')),
  );
  assert.equal(sample.exists(), true);
  await assertFails(getDoc(doc(guest, 'commutes/private')));
});

function matchingSetup(uid = 'wolfie') {
  return { schemaVersion: 1, ownerId: uid, revision: 'v1', commuteKey: 'saved-commute-key',
    mode: 'driver', active: true, optIn: true, campusLot: 'tabler', weekdays: ['mon'],
    pointId: 'stony-brook-station', startWindow: { earliest: 420, latest: 480 },
    arrivalWindow: { earliest: 480, latest: 540 }, seatsRequested: 1,
    maxDetourSeconds: 600, maxExtraRideSeconds: 600, accessWalkSeconds: 0, egressWalkSeconds: 0,
    maxAccessWalkSeconds: 300, maxEgressWalkSeconds: 300, updatedAt: serverTimestamp() };
}
test('matching setup is owner-only, campus-verified and survives reload with a new revision', async () => {
  const owner = authenticatedUser('wolfie'); const other = authenticatedUser('other');
  const reference = doc(owner, 'matchingSetups/wolfie');
  await assertSucceeds(setDoc(reference, matchingSetup()));
  assert.equal((await getDoc(reference)).data().pointId, 'stony-brook-station');
  await assertFails(getDoc(doc(other, 'matchingSetups/wolfie')));
  await assertFails(setDoc(doc(other, 'matchingSetups/wolfie'), matchingSetup()));
  await assertFails(setDoc(reference, { ...matchingSetup(), active: false }));
  await assertSucceeds(setDoc(reference, { ...matchingSetup(), revision: 'v2', active: false }));
  assert.equal((await getDoc(reference)).data().active, false);
  const unverified = authenticatedUser('unverified', { email: 'a@stonybrook.edu', email_verified: false });
  await assertFails(setDoc(doc(unverified, 'matchingSetups/unverified'), matchingSetup('unverified')));
});
test('matching rules reject malformed nested inputs, extra fields and forged ownership', async () => {
  const owner = authenticatedUser('wolfie');
  for (const override of [
    { ownerId: 'other' }, { pointId: 'approximate-area' }, { campusLot: 'other' },
    { startWindow: { earliest: 500, latest: 400 } }, { arrivalWindow: { earliest: 0, latest: 1440 } },
    { maxDetourSeconds: -1 }, { maxExtraRideSeconds: 1.5 }, { weekdays: ['mon', 'mon'] },
    { weekdays: ['not-a-day'] }, { seatsRequested: 7 }, { active: 'true' }, { unexpected: true },
  ]) await assertFails(setDoc(doc(owner, 'matchingSetups/wolfie'), { ...matchingSetup(), ...override }));
});

test('rider Any preference is owner-only, validated and persisted independently of driver parking', async () => {
  const database = authenticatedUser('wolfie');
  const ref = doc(database, 'users', 'wolfie', 'commutes', 'primary');
  await assertSucceeds(setDoc(ref, { ...commute, riderDropoffPreference: 'any' }));
  const value = (await getDoc(ref)).data();
  assert.equal(value.campusLot, 'tabler');
  assert.equal(value.riderDropoffPreference, 'any');
  await assertFails(setDoc(ref, { ...commute, riderDropoffPreference: 'surprise' }));
  await assertFails(getDoc(doc(authenticatedUser('other'), 'users', 'wolfie', 'commutes', 'primary')));
});

test('settlements are readable only by the two people involved and never written by clients', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'settlements/s1'), {
      schemaVersion: 1, participantIds: ['rider', 'driver'], payerId: 'rider', payeeId: 'driver',
      requestIds: ['r1'], cents: 125, method: 'venmo', status: 'MARKED_PAID',
    });
  });
  await assertSucceeds(getDoc(doc(authenticatedUser('rider'), 'settlements/s1')));
  await assertSucceeds(getDoc(doc(authenticatedUser('driver'), 'settlements/s1')));
  await assertFails(getDoc(doc(authenticatedUser('outsider'), 'settlements/s1')));
  await assertFails(setDoc(doc(authenticatedUser('driver'), 'settlements/s1'), { status: 'CONFIRMED' }));
  await assertFails(setDoc(doc(authenticatedUser('rider'), 'settlements/s2'), {
    participantIds: ['rider', 'driver'], cents: 0,
  }));
});

test('payment usernames are private to their owner; riders get them only through the callable', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'paymentHandles/driver'), { venmo: 'alex-chen' });
  });
  await assertSucceeds(getDoc(doc(authenticatedUser('driver'), 'paymentHandles/driver')));
  await assertFails(getDoc(doc(authenticatedUser('rider'), 'paymentHandles/driver')));
  await assertFails(setDoc(doc(authenticatedUser('driver'), 'paymentHandles/driver'), { venmo: 'x' }));
});

test('weekly fuel prices are readable by verified students and written only by the refresh', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pricing/fuel'), { gasUsdPerGallon: 4.35 });
  });
  await assertSucceeds(getDoc(doc(authenticatedUser('rider'), 'pricing/fuel')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'pricing/fuel')));
  await assertFails(setDoc(doc(authenticatedUser('rider'), 'pricing/fuel'), { gasUsdPerGallon: 0.01 }));
});

test('a price adjustment is readable by its driver and rider only, and never written by clients', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'priceAdjustments/driver_rider'), {
      participantIds: ['driver', 'rider'], driverId: 'driver', riderId: 'rider', adjustment: -50,
    });
  });
  await assertSucceeds(getDoc(doc(authenticatedUser('driver'), 'priceAdjustments/driver_rider')));
  await assertSucceeds(getDoc(doc(authenticatedUser('rider'), 'priceAdjustments/driver_rider')));
  await assertFails(getDoc(doc(authenticatedUser('outsider'), 'priceAdjustments/driver_rider')));
  await assertFails(setDoc(doc(authenticatedUser('rider'), 'priceAdjustments/driver_rider'), { adjustment: -100 }));
});
