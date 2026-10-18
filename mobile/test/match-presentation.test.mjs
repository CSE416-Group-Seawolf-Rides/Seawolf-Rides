import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATCH_PAGE_SIZES,
  matchedPeople,
  matchPage,
  matchMapRegion,
} from '../src/calendar/matchPresentation.ts';
const area = {
  label: 'Stony Brook',
  radiusMiles: 2,
  center: { latitude: 40.9, longitude: -73.1 },
};
const match = (driverId, riderId, gap = 0, detour = 100) => ({
  driverId,
  riderId,
  name: driverId === 'me' ? riderId : driverId,
  area,
  arrivalDifferenceSeconds: gap,
  addedDrivingSeconds: detour,
});
test('Either arrangements produce one ranked person card with both actual plans retained', () => {
  const drive = match('me', 'partner', 60),
    ride = match('partner', 'me', 30);
  const people = matchedPeople([drive, ride, { ...ride }], 'me');
  assert.equal(people.length, 1);
  assert.equal(people[0].id, 'partner');
  assert.deepEqual(people[0].options, [ride, drive]);
  assert.equal(people[0].area, area);
});
test('driver and rider searches identify the other participant and preserve canonical ordering', () => {
  assert.deepEqual(
    matchedPeople([match('me', 'b', 60), match('me', 'a', 30)], 'me').map((p) => p.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    matchedPeople([match('b', 'me', 60), match('a', 'me', 30)], 'me').map((p) => p.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    matchedPeople([match('b', 'me'), match('a', 'me')], 'me').map((p) => p.id),
    ['a', 'b'],
  );
});
test('all supported page sizes cap visible people, including a final partial page', () => {
  const people = Array.from({ length: 23 }, (_, i) => ({ id: String(i) }));
  assert.deepEqual(MATCH_PAGE_SIZES, [1, 2, 5, 10]);
  for (const size of MATCH_PAGE_SIZES) {
    const all = [];
    for (let page = 0; page < Math.ceil(people.length / size); page++) {
      const view = matchPage(people, size, page);
      assert.ok(view.people.length <= size && view.people.length <= 10);
      assert.equal(view.page, page);
      all.push(...view.people);
    }
    assert.deepEqual(all, people, 'no skipped or duplicate people between pages');
  }
});
test('empty results and changed list lengths keep page controls within valid bounds', () => {
  assert.deepEqual(matchPage([], 5, 9), { page: 0, pages: 1, people: [] });
  assert.equal(matchPage([{ id: 'a' }], 5, 4).page, 0);
  assert.equal(matchPage([{ id: 'a' }], 1, -1).page, 0);
  for (const invalid of [0, 3, 20, NaN]) assert.throws(() => matchPage([], invalid, 0));
  assert.throws(() => matchPage([], 5, Infinity));
});
test('changing page size can retain the first visible person without exceeding ten cards', () => {
  const people = Array.from({ length: 23 }, (_, i) => ({ id: String(i) }));
  const before = matchPage(people, 5, 2);
  const after = matchPage(people, 2, Math.floor((before.page * 5) / 2));
  assert.equal(after.people[0].id, before.people[0].id);
});
test('detail viewport includes the owner pin and the whole approximate circle without routing or another exact pin', () => {
  const own = { latitude: 40.8, longitude: -73.3 };
  const region = matchMapRegion(own, area);
  const within = (point) =>
    Math.abs(point.latitude - region.latitude) <= region.latitudeDelta / 2 &&
    Math.abs(point.longitude - region.longitude) <= region.longitudeDelta / 2;
  assert.ok(within(own));
  const lat = 2 / 69,
    lng = lat / Math.cos((area.center.latitude * Math.PI) / 180);
  for (const sign of [-1, 1])
    assert.ok(
      within({
        latitude: area.center.latitude + sign * lat,
        longitude: area.center.longitude + sign * lng,
      }),
    );
  assert.ok(Object.values(region).every(Number.isFinite));
  assert.deepEqual(Object.keys(region).sort(), [
    'latitude',
    'latitudeDelta',
    'longitude',
    'longitudeDelta',
  ]);
});
