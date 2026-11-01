// Seeds the local demo emulators with a ready-to-explore account and a few classmates.
//
//   npm run seed:demo
//
// Run from mobile/ while `node scripts/start-local-demo.mjs --live-osrm` is running. Safe to rerun:
// it rewrites only the demo-* accounts and their rides, chats, and payments.
// Demo sign-in: demo@stonybrook.edu / seawolf-demo-2026 ("Explore as a guest" uses it).

import { createHash } from 'node:crypto';
import { initializeApp as clientApp, deleteApp as deleteClient } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { createRequire } from 'node:module';

import { toPrivacyArea } from '../src/commute/commuteModel.ts';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { localDateAt, localMinuteToEpoch, weekdayForDate } from '../src/mvp/settings.ts';
import { DEFAULT_FUEL_PRICES, applyAdjustment, ridePrice } from '../src/payments/pricing.ts';
import { DEMO_ACCOUNT } from '../src/auth/demoAccount.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:9095';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-seawolf-rides' });
const auth = getAuth();
const db = getFirestore();

const sha = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const requestIdFor = (rider, driver, date, direction = 'TO_CAMPUS') => sha([rider, driver, date, direction]);
const commitmentIdFor = (uid, date, direction = 'TO_CAMPUS') => sha([uid, date, direction]);
const chatIdFor = (a, b) => sha([a, b].sort());
const CAMPUS = { tabler: { latitude: 40.9097068, longitude: -73.1269548 } };
const PHOTO = '/9j/AA=='; // Placeholder thumbnail accepted by the demo validator.

const day = (d, mode, arriveBy, startAt, leaveAt = 17 * 60) => ({ day: d, mode, arriveBy, leaveAt, startAt });
const people = {
  wolfie: {
    uid: 'demo-wolfie',
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
    name: 'Wolfie',
    role: 'both',
    bio: 'Senior studying Computer Science · Commuter Student Association. Always down for early morning carpools to West Side!',
    point: { latitude: 40.8584, longitude: -73.0996 },
    area: 'Centereach area',
    days: [
      day('mon', 'ride', 540, 495),
      day('tue', 'drive', 570, 520, 990),
      day('wed', 'ride', 540, 495),
      day('thu', 'drive', 570, 520, 990),
      day('fri', 'ride', 600, 555, 840),
    ],
    seats: 3,
    vehicle: { type: 'Sedan', color: 'Silver', plate: 'SBU 2026', fuelType: 'gas', efficiency: 34 },
    handles: { venmo: 'wolfie-seawolf', paypal: 'WolfieSeawolf', zelle: DEMO_ACCOUNT.email },
  },
  alex: {
    uid: 'demo-alex',
    name: 'Alex',
    role: 'driver',
    bio: 'Mechanical Engineering grad student. Driving from Lake Grove with great playlists and smooth highway routes.',
    point: { latitude: 40.8526, longitude: -73.1152 },
    area: 'Lake Grove area',
    days: [day('mon', 'drive', 530, 485), day('wed', 'drive', 530, 485), day('fri', 'drive', 530, 485)],
    seats: 3,
    vehicle: { type: 'Honda Civic', color: 'Gray', plate: 'LGV 4410' },
    handles: { venmo: 'alex-chen-sbu', paypal: 'AlexChenSBU', zelle: 'alex.chen@stonybrook.edu' },
  },
  sam: {
    uid: 'demo-sam',
    name: 'Sam',
    role: 'driver',
    bio: 'Sophomore majoring in Economics. Driving an all-electric Tesla Model 3 from Hauppauge. Quiet and comfortable ride.',
    point: { latitude: 40.8257, longitude: -73.2027 },
    area: 'Hauppauge area',
    days: [day('fri', 'drive', 595, 545, 840), day('mon', 'drive', 545, 500)],
    seats: 2,
    vehicle: { type: 'Tesla Model 3', color: 'White', plate: 'EV SAM1', fuelType: 'electric' },
    handles: { venmo: 'sam-rivera-sbu' },
  },
  maya: {
    uid: 'demo-maya',
    name: 'Maya',
    role: 'rider',
    bio: 'Biochemistry major · Class of 27. Riding from Lake Ronkonkoma on Tuesdays and Thursdays for morning lab.',
    point: { latitude: 40.8085, longitude: -73.1145 },
    area: 'Lake Ronkonkoma area',
    days: [day('tue', 'ride', 555, 500, 990), day('thu', 'ride', 555, 500, 990)],
  },
  chris: {
    uid: 'demo-chris',
    name: 'Chris',
    role: 'rider',
    // On Hawkins Road: routing only trusts start points within 75 m of a road.
    point: { latitude: 40.916691, longitude: -73.139807 },
    area: 'Stony Brook area',
    days: [day('tue', 'ride', 570, 525, 990), day('thu', 'ride', 570, 525, 990)],
    bio: 'Senior studying Applied Math & Statistics. Commutes from Stony Brook Station. Early bird for 8:30 AM classes.',
  },
  jordan: {
    uid: 'demo-jordan',
    name: 'Jordan',
    role: 'rider',
    bio: 'Junior in Biology (Pre-Med). Commuting from Centereach for morning labs. Coffee lover and podcast listener!',
    point: { latitude: 40.8620, longitude: -73.1050 },
    area: 'Centereach area',
    days: [day('tue', 'ride', 570, 525, 990), day('thu', 'ride', 570, 525, 990)],
  },
  taylor: {
    uid: 'demo-taylor',
    name: 'Taylor',
    role: 'rider',
    bio: 'Junior in Computer Engineering · Robotics Club. Commuting from Port Jefferson Station for afternoon labs.',
    point: { latitude: 40.9250, longitude: -73.0550 },
    area: 'Port Jefferson Station area',
    days: [
      day('mon', 'ride', 540, 495, 1020),
      day('tue', 'ride', 570, 525, 990),
      day('wed', 'ride', 540, 495, 1020),
      day('thu', 'ride', 570, 525, 990),
      day('fri', 'ride', 600, 555, 840),
    ],
  },
};

async function account(p) {
  const email = p.email ?? `${p.uid.replace('demo-', '')}.demo@stonybrook.edu`;
  await auth.deleteUser(p.uid).catch(() => undefined);
  await auth.createUser({ uid: p.uid, email, emailVerified: true, password: p.password ?? 'seawolf-demo-2026', displayName: p.name });
  const now = Timestamp.now();
  await db.doc(`users/${p.uid}`).set({ schemaVersion: 1, firstName: p.name, role: p.role, updatedAt: now });
  await db.doc(`publicProfiles/${p.uid}`).set({
    schemaVersion: 1,
    ownerId: p.uid,
    displayName: p.name,
    role: p.role,
    bio: p.bio ?? '',
    updatedAt: now,
  });
  await db.doc(`users/${p.uid}/commutes/primary`).set({
    schemaVersion: 1,
    ownerId: p.uid,
    startArea: toPrivacyArea(p.point, p.area),
    startPoint: p.point,
    discoveryEnabled: true,
    campusLot: 'tabler',
    days: p.days,
    ...(p.seats ? { seats: p.seats } : {}),
    updatedAt: now,
  });
  if (p.vehicle)
    await db.doc(`users/${p.uid}/vehicles/primary`).set({
      schemaVersion: 1,
      ownerId: p.uid,
      photoBase64: PHOTO,
      plateRegion: 'New York',
      ...p.vehicle,
      updatedAt: new Date(),
    });
  if (p.handles) await db.doc(`paymentHandles/${p.uid}`).set({ ...p.handles, updatedAt: new Date() });
}

// Removes previously seeded rides/chats/payments so reruns start clean.
async function clearSeeded() {
  const uids = Object.values(people).map((p) => p.uid);
  for (const name of ['rideRequests', 'chats', 'settlements']) {
    const snapshot = await db.collection(name).where('participantIds', 'array-contains-any', uids).get();
    for (const doc of snapshot.docs) {
      if (name === 'chats') await db.recursiveDelete(doc.ref);
      else {
        if (name === 'rideRequests') {
          await db.doc(`ridePickups/${doc.id}`).delete();
          await db.doc(`_settledRequests/${doc.id}`).delete();
          for (const uid of doc.data().participantIds ?? []) {
            await db.doc(`_rideCommitments/${commitmentIdFor(uid, doc.data().localDate, 'TO_CAMPUS')}`).delete();
            await db.doc(`_rideCommitments/${commitmentIdFor(uid, doc.data().localDate, 'FROM_CAMPUS')}`).delete();
          }
        }
        await doc.ref.delete();
      }
    }
  }
  for (const doc of (await db.collection('priceAdjustments').where('participantIds', 'array-contains-any', uids).get()).docs)
    await doc.ref.delete();
}

function nearest(dayName, from, direction, count) {
  const dates = [];
  for (let i = direction > 0 ? 0 : -1; dates.length < count && Math.abs(i) < 40; i += direction)
    if (weekdayForDate(shiftDate(from, i)) === dayName) dates.push(shiftDate(from, i));
  return dates;
}

async function ride({ driver, rider, date, status, initiator = rider, adjustment, pickupMinute, direction = 'TO_CAMPUS' }) {
  const isReturn = direction === 'FROM_CAMPUS';
  const departureMinute = isReturn ? (pickupMinute ?? 16 * 60 + 30) : (pickupMinute - 15);
  const departure = localMinuteToEpoch(date, departureMinute);
  const pickup = isReturn ? departure : localMinuteToEpoch(date, pickupMinute);
  const arrival = isReturn ? (pickup + 20 * 60) : (pickup + 25 * 60);
  const metrics = {
    soloDurationSeconds: 1500,
    sharedDurationSeconds: 2400,
    driverExtraDurationSeconds: 540,
    activeDriverDetourLimitSeconds: 3600,
    riderInVehicleSeconds: 1500,
    riderExtraInVehicleSeconds: 0,
    sharedDistanceMeters: 21000,
    driverExtraDistanceMeters: 3400,
    accessWalkSeconds: 0,
    egressWalkSeconds: 0,
  };
  const vehicle = people[Object.keys(people).find((k) => people[k].uid === driver.uid)].vehicle;
  const price = applyAdjustment(ridePrice(metrics, vehicle ?? null, DEFAULT_FUEL_PRICES), adjustment);
  const id = requestIdFor(rider.uid, driver.uid, date, direction);
  const created = Math.floor(Date.now() / 1000) - 86400 * 3;
  const value = {
    schemaVersion: 1,
    source: 'CALENDAR',
    participantIds: [rider.uid, driver.uid],
    initiatorId: initiator.uid,
    attemptId: sha([id, 'seed']).slice(0, 20),
    driverId: driver.uid,
    riderId: rider.uid,
    driverName: driver.name,
    riderName: rider.name,
    localDate: date,
    direction,
    status,
    riderRevision: 'seed',
    driverRevision: 'seed',
    seats: 1,
    pickupLabel: isReturn ? 'Stony Brook Campus' : rider.area,
    campusLabel: 'Tabler',
    dropoffLabel: isReturn ? rider.area : 'Tabler',
    plan: {
      occurrence: { localDate: date, direction },
      feasibleDepartureWindow: { earliest: departure - 600, latest: departure + 300 },
      departure,
      pickup,
      boardingComplete: pickup + 120,
      vehicleCampusArrival: isReturn ? departure : arrival,
      riderDestinationArrival: arrival,
    },
    metrics,
    price,
    createdAt: created,
    updatedAt: created,
  };
  await db.doc(`rideRequests/${id}`).set(value);
  if (status === 'ACCEPTED') {
    await db.doc(`ridePickups/${id}`).set(
      { campus: CAMPUS.tabler, driverStart: driver.point, riderPickup: rider.point },
    );
    for (const uid of value.participantIds)
      await db.doc(`_rideCommitments/${commitmentIdFor(uid, date, direction)}`).set({
        requestId: id, userId: uid, localDate: date, direction, reservedSeats: 1,
      });
  }
  return { id, value };
}

// Signs in as the rider and goes through search → request exactly like the app does.
async function realRequest(rider, driver, date, direction = 'TO_CAMPUS') {
  const app = clientApp({ projectId: 'demo-seawolf-rides', apiKey: 'emulator-only' }, `seed-${rider.uid}-${direction}`);
  try {
    const signIn = clientAuth(app);
    connectAuthEmulator(signIn, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(signIn, `${rider.uid.replace('demo-', '')}.demo@stonybrook.edu`, 'seawolf-demo-2026');
    const functions = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    const call = async (name, data) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return (await httpsCallable(functions, name, { timeout: 120000 })(data)).data;
        } catch (error) {
          if (error.code !== 'functions/resource-exhausted' || attempt > 8) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    };
    let cursor;
    for (let page = 0; page < 6; page++) {
      const result = await call('findCommuteMatches', { localDate: date, direction, ...(cursor ? { cursor } : {}) });
      const match = result.matches.find((m) => m.driverId === driver.uid && m.riderId === rider.uid);
      if (match) {
        const created = await call('createRideRequest', {
          source: 'CALENDAR',
          proposedPlan: {
            departure: match.plan.departure,
            pickup: match.plan.pickup,
            vehicleCampusArrival: match.plan.vehicleCampusArrival,
          },
          driverId: match.driverId,
          riderId: match.riderId,
          localDate: date,
          direction,
          riderRevision: match.riderRevision,
          driverRevision: match.driverRevision,
          attemptId: sha([rider.uid, driver.uid, date, direction, Date.now()]).slice(0, 20),
        });
        return { id: created.id, value: (await db.doc(`rideRequests/${created.id}`).get()).data() };
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    console.warn(`No route-feasible match for ${rider.name} → ${driver.name} on ${date} (${direction}); creating direct pending request.`);
    return await ride({ driver, rider, date, status: 'PENDING', direction, pickupMinute: direction === 'FROM_CAMPUS' ? 990 : 540 });
  } catch (error) {
    console.warn(`Couldn’t create ${rider.name} request via backend (${error.message}); creating direct pending request.`);
    return await ride({ driver, rider, date, status: 'PENDING', direction, pickupMinute: direction === 'FROM_CAMPUS' ? 990 : 540 });
  } finally {
    await deleteClient(app);
  }
}

async function chat(driver, rider, request, lines) {
  const ref = db.doc(`chats/${chatIdFor(driver.uid, rider.uid)}`);
  const start = Date.now() - 1000 * 60 * 60 * 26;
  await ref.set({
    schemaVersion: 1,
    participantIds: [driver.uid, rider.uid].sort(),
    names: { [driver.uid]: driver.name, [rider.uid]: rider.name },
    requestId: request.id,
    localDate: request.value.localDate,
    campusLabel: 'Tabler',
    trip: {
      driverId: driver.uid, riderId: rider.uid, localDate: request.value.localDate, campusLabel: 'Tabler', direction: request.value.direction,
      departure: request.value.plan.departure, pickup: request.value.plan.pickup,
      vehicleCampusArrival: request.value.plan.vehicleCampusArrival,
    },
    createdAt: start,
    updatedAt: start + lines.length * 60000,
    messageCount: lines.length,
    lastMessage: lines.at(-1)[1],
  });
  for (const [i, [sender, text]] of lines.entries())
    await ref.collection('messages').doc(`seed-${i + 1}`).set({
      senderId: sender.uid, text, sentAt: start + i * 60000, sequence: i + 1,
    });
}

async function main() {
  for (const p of Object.values(people)) await account(p);
  await clearSeeded();
  const { wolfie, alex, maya, chris } = people;
  const today = localDateAt(Math.floor(Date.now() / 1000));

  // Wolfie rides with Alex on Mon/Wed: two recent unpaid rides, one paid and confirmed, two ahead.
  const pastWithAlex = [...nearest('mon', today, -1, 2), ...nearest('wed', today, -1, 1)].sort();
  const aheadWithAlex = [...nearest('mon', shiftDate(today, 1), 1, 1), ...nearest('wed', shiftDate(today, 1), 1, 1)];
  const alexRides = [];
  for (const date of [...pastWithAlex, ...aheadWithAlex])
    alexRides.push(await ride({ driver: alex, rider: wolfie, date, status: 'ACCEPTED', pickupMinute: 500 }));
  const paid = alexRides.find((r) => r.value.localDate === pastWithAlex[0]);
  const settlement = db.collection('settlements').doc('seed-alex-paid');
  await settlement.set({
    schemaVersion: 1, participantIds: [wolfie.uid, alex.uid], payerId: wolfie.uid, payeeId: alex.uid,
    payerName: wolfie.name, payeeName: alex.name, requestIds: [paid.id], cents: paid.value.price.cents,
    method: 'venmo', status: 'CONFIRMED',
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 5, updatedAt: Math.floor(Date.now() / 1000) - 86400 * 4,
  });
  await db.doc(`_settledRequests/${paid.id}`).set({ settlementId: settlement.id, createdAt: 0 });

  // Wolfie drives Maya on Tue/Thu at 25% off: one she owes, one she marked paid, two ahead.
  await db.doc(`priceAdjustments/${wolfie.uid}_${maya.uid}`).set({
    participantIds: [wolfie.uid, maya.uid], driverId: wolfie.uid, riderId: maya.uid, adjustment: -25, updatedAt: 0,
  });
  const pastWithMaya = [...nearest('tue', today, -1, 1), ...nearest('thu', today, -1, 1)].sort();
  const aheadWithMaya = [...nearest('tue', shiftDate(today, 1), 1, 1), ...nearest('thu', shiftDate(today, 1), 1, 1)];
  const mayaRides = [];
  for (const date of [...pastWithMaya, ...aheadWithMaya]) {
    mayaRides.push(await ride({ driver: wolfie, rider: maya, date, status: 'ACCEPTED', adjustment: -25, pickupMinute: 530, direction: 'TO_CAMPUS' }));
    mayaRides.push(await ride({ driver: wolfie, rider: maya, date, status: 'ACCEPTED', adjustment: -25, pickupMinute: 990, direction: 'FROM_CAMPUS' }));
  }
  const sent = mayaRides.find((r) => r.value.localDate === pastWithMaya[0] && r.value.direction === 'TO_CAMPUS');
  await db.collection('settlements').doc('seed-maya-sent').set({
    schemaVersion: 1, participantIds: [maya.uid, wolfie.uid], payerId: maya.uid, payeeId: wolfie.uid,
    payerName: maya.name, payeeName: wolfie.name, requestIds: [sent.id], cents: sent.value.price.cents,
    method: 'paypal', status: 'MARKED_PAID',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
  });
  await db.doc(`_settledRequests/${sent.id}`).set({ settlementId: 'seed-maya-sent', createdAt: 0 });

  // Chris is waiting on Wolfie's answer for a Thursday morning drive.
  const chrisDate = nearest('thu', shiftDate(today, 8), 1, 1)[0];
  const chrisRequest = await realRequest(chris, wolfie, chrisDate, 'TO_CAMPUS');

  // Jordan is waiting on Wolfie's answer for an evening return trip home.
  const jordan = people.jordan;
  const jordanDate = nearest('tue', shiftDate(today, 1), 1, 1)[0];
  const jordanReturnRequest = await realRequest(jordan, wolfie, jordanDate, 'FROM_CAMPUS');

  await chat(alex, wolfie, alexRides.at(-1), [
    [alex, 'Hey! Accepted your Mon/Wed request. I’ll be at the Smith Haven Mall Macy’s entrance.'],
    [wolfie, 'Perfect, thank you! I’ll be there a few minutes early.'],
    [alex, 'Sounds good. Gray Civic, plate ending 4410.'],
  ]);
  await chat(wolfie, maya, mayaRides.at(-1), [
    [maya, 'Thanks for taking me on Tuesdays and Thursdays!'],
    [wolfie, 'Of course. I knocked 25% off the gas share, the detour is tiny.'],
    [maya, 'You’re the best. Sent this week’s on PayPal.'],
  ]);
  if (chrisRequest)
    await chat(wolfie, chris, chrisRequest, [
      [chris, 'Hi! I sent a request for that Thursday, I have a 9:30 lab.'],
    ]);
  if (jordanReturnRequest)
    await chat(wolfie, jordan, jordanReturnRequest, [
      [jordan, 'Hi Wolfie! Any room in your car for the return trip home from Tabler on Tuesday afternoon?'],
    ]);

  console.log(`Seeded the demo account: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
  console.log('Classmates: Alex (drives Wolfie), Maya (rides with Wolfie), Chris (pending request), Sam (Friday driver, EV).');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message);
    console.error('Is the demo backend running? Start it with: node scripts/start-local-demo.mjs --live-osrm');
    process.exit(1);
  },
);
