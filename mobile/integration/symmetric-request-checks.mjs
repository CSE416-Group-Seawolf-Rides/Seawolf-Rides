import assert from 'node:assert/strict';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { shiftDate } from '../src/calendar/commuteCalendar.ts';
import { vehicleFixture } from './matching-fixtures.mjs';

function observed(account, id, status, attemptId) {
  return new Promise((resolve, reject) => {
    let stop;
    const timeout = setTimeout(() => {
      stop?.();
      reject(new Error(`Missing shared ${status} update`));
    }, 10000);
    stop = onSnapshot(
      doc(account.db, 'rideRequests', id),
      (snapshot) => {
        const value = snapshot.data();
        if (value?.status === status && value.attemptId === attemptId) {
          clearTimeout(timeout);
          stop();
          resolve(value);
        }
      },
      (error) => {
        clearTimeout(timeout);
        stop?.();
        reject(error);
      },
    );
  });
}
export async function verifySymmetricRequests(
  t,
  { client, action, db, date, start, pickup, outsider },
) {
  const driver = await client('symmetric-driver', 'driver', start, date);
  const rider = await client('symmetric-rider', 'rider', pickup, date);
  const pair = [driver, rider];
  const inputFor = async (localDate, attemptId) => {
    const result = await action(driver, 'findCommuteMatches', { localDate });
    const match = result.matches.find((m) => m.driverId === driver.uid && m.riderId === rider.uid);
    assert.ok(match, 'a real persisted pair must be recommended before requesting');
    return {
      source: 'CALENDAR',
      direction: 'TO_CAMPUS',
      localDate,
      driverId: driver.uid,
      riderId: rider.uid,
      riderRevision: match.riderRevision,
      driverRevision: match.driverRevision,
      attemptId,
      proposedPlan: {
        departure: match.plan.departure,
        pickup: match.plan.pickup,
        vehicleCampusArrival: match.plan.vehicleCampusArrival,
      },
    };
  };
  const cancel = (account, value) =>
    action(account, 'cancelRideRequest', { requestId: value.id, attemptId: value.attemptId });
  const respond = (account, value, decision) =>
    action(account, 'respondToRideRequest', {
      requestId: value.id,
      attemptId: value.attemptId,
      decision,
    });
  try {
    await t.test(
      'driver initiates, sender alone cancels, both clients observe cancellation and no seats are reserved',
      async () => {
        const input = await inputFor(date, 'symmetric-driver-proposal-1');
        await assert.rejects(
          action(driver, 'createRideRequest', input),
          (e) =>
            e.code === 'functions/failed-precondition' && e.details.reason === 'VEHICLE_REQUIRED',
        );
        await action(driver, 'saveVehicleDetails', vehicleFixture(driver.uid));
        await assert.rejects(action(outsider, 'createRideRequest', input), {
          code: 'functions/permission-denied',
        });
        await assert.rejects(
          action(driver, 'createRideRequest', { ...input, riderId: driver.uid }),
          { code: 'functions/invalid-argument' },
        );
        const value = await action(driver, 'createRideRequest', input);
        const pending = (await getDoc(doc(rider.db, 'rideRequests', value.id))).data();
        assert.equal(pending.initiatorId, driver.uid);
        await assert.rejects(respond(driver, value, 'ACCEPTED'), {
          code: 'functions/permission-denied',
        });
        await assert.rejects(cancel(rider, value), { code: 'functions/permission-denied' });
        await assert.rejects(cancel(outsider, value), { code: 'functions/permission-denied' });
        const updates = pair.map((account) =>
          observed(account, value.id, 'CANCELLED', value.attemptId),
        );
        assert.equal((await cancel(driver, value)).status, 'CANCELLED');
        await Promise.all(updates);
        assert.equal(
          (await cancel(driver, value)).status,
          'CANCELLED',
          'duplicate cancellation is idempotent',
        );
        assert.equal(
          (await db.collection('_rideCommitments').where('userId', '==', driver.uid).get()).size,
          0,
        );
        assert.equal((await db.doc(`ridePickups/${value.id}`).get()).exists, false);
        assert.equal(
          (await action(driver, 'createRideRequest', input)).status,
          'CANCELLED',
          'a delayed retry cannot resurrect its cancelled proposal',
        );
        await assert.rejects(getDoc(doc(outsider.db, 'rideRequests', value.id)), {
          code: 'permission-denied',
        });
      },
    );
    await t.test(
      'resend gets a fresh proposal, stale actions cannot affect it, passenger can accept without a vehicle',
      async () => {
        const input = await inputFor(date, 'symmetric-driver-proposal-2');
        const value = await action(driver, 'createRideRequest', input);
        assert.equal(value.status, 'PENDING');
        await assert.rejects(action(driver, 'cancelRideRequest', { requestId: value.id }), {
          code: 'functions/aborted',
        });
        await assert.rejects(
          action(rider, 'respondToRideRequest', { requestId: value.id, decision: 'ACCEPTED' }),
          { code: 'functions/aborted' },
        );
        const stale = { ...value, attemptId: 'symmetric-driver-proposal-1' };
        await assert.rejects(cancel(driver, stale), { code: 'functions/aborted' });
        await assert.rejects(respond(rider, stale, 'DECLINED'), { code: 'functions/aborted' });
        await assert.rejects(respond(rider, stale, 'ACCEPTED'), { code: 'functions/aborted' });
        assert.equal((await db.doc(`users/${rider.uid}/vehicles/primary`).get()).exists, false);
        const updates = pair.map((account) =>
          observed(account, value.id, 'ACCEPTED', value.attemptId),
        );
        await respond(rider, value, 'ACCEPTED');
        await Promise.all(updates);
        await assert.rejects(cancel(driver, value), { code: 'functions/failed-precondition' });
        assert.equal(
          (await db.collection('_rideCommitments').where('requestId', '==', value.id).get()).size,
          2,
        );
        for (const account of pair)
          assert.equal((await getDoc(doc(account.db, 'ridePickups', value.id))).exists(), true);
        await assert.rejects(getDoc(doc(outsider.db, 'ridePickups', value.id)), {
          code: 'permission-denied',
        });
      },
    );
    await t.test(
      'rider cancellation works identically; driver vehicle eligibility is still checked when passenger accepts',
      async () => {
        const localDate = shiftDate(date, 7);
        const input = await inputFor(localDate, 'symmetric-rider-proposal-3');
        const value = await action(rider, 'createRideRequest', input);
        assert.equal(
          (await db.doc(`rideRequests/${value.id}`).get()).data().initiatorId,
          rider.uid,
        );
        await assert.rejects(cancel(driver, value), { code: 'functions/permission-denied' });
        const updates = pair.map((account) =>
          observed(account, value.id, 'CANCELLED', value.attemptId),
        );
        await cancel(rider, value);
        await Promise.all(updates);
        await assert.rejects(respond(driver, value, 'ACCEPTED'), {
          code: 'functions/failed-precondition',
        });
        const again = await action(driver, 'createRideRequest', {
          ...input,
          attemptId: 'symmetric-driver-proposal-4',
        });
        await db.doc(`users/${driver.uid}/vehicles/primary`).delete();
        await assert.rejects(
          respond(rider, again, 'ACCEPTED'),
          (e) =>
            e.code === 'functions/failed-precondition' && e.details.reason === 'VEHICLE_REQUIRED',
        );
        await respond(rider, again, 'DECLINED');
        assert.equal((await db.doc(`rideRequests/${again.id}`).get()).data().status, 'DECLINED');
        await action(driver, 'saveVehicleDetails', vehicleFixture(driver.uid));
      },
    );
    await t.test(
      'acceptance versus cancellation commits one final state with matching reservations',
      async () => {
        const input = await inputFor(shiftDate(date, 14), 'symmetric-driver-proposal-5');
        const value = await action(driver, 'createRideRequest', input);
        const outcomes = await Promise.allSettled([
          respond(rider, value, 'ACCEPTED'),
          cancel(driver, value),
        ]);
        assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
        const current = (await db.doc(`rideRequests/${value.id}`).get()).data();
        assert.ok(['ACCEPTED', 'CANCELLED'].includes(current.status));
        assert.equal(
          (await db.collection('_rideCommitments').where('requestId', '==', value.id).get()).size,
          current.status === 'ACCEPTED' ? 2 : 0,
        );
        for (const account of pair)
          assert.equal(
            (await getDoc(doc(account.db, 'rideRequests', value.id))).data().status,
            current.status,
          );
      },
    );
    await t.test(
      'crossed requests and Either role reversal share one pending proposal without automatic acceptance',
      async () => {
        for (const account of pair) {
          await db.doc(`users/${account.uid}`).update({ role: 'both' });
          const ref = db.doc(`users/${account.uid}/commutes/primary`),
            saved = (await ref.get()).data();
          await ref.update({
            seats: 1,
            days: saved.days.map((day) => ({ ...day, mode: 'either' })),
          });
        }
        const input = await inputFor(shiftDate(date, 21), 'symmetric-crossed-proposal-6');
        const both = await Promise.all([
          action(driver, 'createRideRequest', input),
          action(rider, 'createRideRequest', {
            ...input,
            attemptId: 'symmetric-crossed-proposal-7',
          }),
        ]);
        assert.equal(both[0].id, both[1].id);
        assert.equal(both[0].attemptId, both[1].attemptId);
        assert.equal(both[0].status, 'PENDING');
        const reverse = await action(rider, 'createRideRequest', {
          ...input,
          driverId: rider.uid,
          riderId: driver.uid,
          attemptId: 'symmetric-reversed-proposal-8',
        });
        assert.equal(reverse.id, both[0].id);
        const proposals = await db
          .collection('rideRequests')
          .where('localDate', '==', input.localDate)
          .get();
        assert.equal(
          proposals.docs.filter(
            (d) =>
              d.data().participantIds.includes(driver.uid) &&
              d.data().participantIds.includes(rider.uid) &&
              d.data().status === 'PENDING',
          ).length,
          1,
        );
        const current = (await db.doc(`rideRequests/${reverse.id}`).get()).data();
        const sender = current.initiatorId === driver.uid ? driver : rider;
        await assert.rejects(respond(sender, reverse, 'ACCEPTED'), {
          code: 'functions/permission-denied',
        });
        await cancel(sender, reverse);
        const replacement = await action(sender, 'createRideRequest', {
          ...input,
          attemptId: 'symmetric-crossed-proposal-9',
        });
        await cancel(sender, replacement);
        for (const [account, attemptId] of [
          [driver, input.attemptId],
          [rider, 'symmetric-crossed-proposal-7'],
        ]) {
          const replay = await action(account, 'createRideRequest', { ...input, attemptId });
          assert.equal(
            replay.status,
            'CANCELLED',
            'a handled crossed send cannot reopen after a later proposal is cancelled',
          );
          assert.equal(replay.attemptId, replacement.attemptId);
        }
        await assert.rejects(getDoc(doc(rider.db, '_rideRequestAttempts', 'private')), {
          code: 'permission-denied',
        });
      },
    );
  } finally {
    for (const account of pair)
      await db.doc(`users/${account.uid}/commutes/primary`).update({ discoveryEnabled: false });
  }
}
