import assert from 'node:assert/strict';
import test from 'node:test';

import {
  demoCommute,
  demoIncoming,
  demoOutgoing,
  firstNameFromEmail,
} from '../src/prototypeData/demoAccount.ts';
import { driverOfferFixtures, riderRequestFixtures } from '../src/rides/rideFixtures.ts';
import { getUpcoming, incomingForCommute, matchDrivers } from '../src/rides/rideModel.ts';

test('derives a friendly first name from a sign-in email', () => {
  assert.equal(firstNameFromEmail('wolfie.seawolf@stonybrook.edu'), 'Wolfie');
  assert.equal(firstNameFromEmail('JDOE42@stonybrook.edu'), 'Jdoe');
  assert.equal(firstNameFromEmail('42@stonybrook.edu'), 'there');
});

test('the demo week has rides, drives, and a day that still needs a driver', () => {
  const incoming = incomingForCommute(demoCommute, demoIncoming(riderRequestFixtures)).map(
    (view) => view.request,
  );
  const monday = new Date(2026, 8, 28, 6, 0);
  const week = getUpcoming(demoCommute, demoOutgoing, incoming, driverOfferFixtures, monday, [], 5);

  assert.deepEqual(
    week.map((item) => [item.day, item.kind]),
    [
      ['mon', 'ride'],
      ['tue', 'drive'],
      ['wed', 'ride'],
      ['thu', 'drive'],
      ['fri', 'open'],
    ],
  );
  assert.equal(week[0].offer.driverName, 'Alex');
  assert.deepEqual(week[1].riders.map((rider) => rider.riderName), ['Maya']);
});

test('every demo pickup spot and chat-linked match exists in the fixtures', () => {
  for (const offer of driverOfferFixtures) {
    assert.ok(offer.pickupSpot, `${offer.id} needs a pickup spot`);
  }
  for (const request of riderRequestFixtures) {
    assert.ok(request.pickupSpot, `${request.id} needs a pickup spot`);
  }
  assert.ok(demoOutgoing.every((r) => driverOfferFixtures.some((o) => o.id === r.offerId)));
});

test('the demo rider has a good Friday option at the top of their matches', () => {
  const [best] = matchDrivers(
    { ...demoCommute, days: demoCommute.days.filter((day) => day.day === 'fri') },
    driverOfferFixtures,
  );
  assert.equal(best.offer.id, 'dan');
});
