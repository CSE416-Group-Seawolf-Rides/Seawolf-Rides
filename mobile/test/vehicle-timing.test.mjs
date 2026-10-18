import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVehicle, vehicleIsComplete, MAX_VEHICLE_PHOTO_LENGTH } from '../src/vehicle/vehicleModel.ts';
import { suggestedStartMinute } from '../src/commute/morningTiming.ts';

const details = { schemaVersion: 1, ownerId: 'driver', type: ' Toyota Corolla ', color: ' Blue ', photoBase64: '/9j/AA==', plate: 'abc 123', plateRegion: 'New York' };
test('vehicle setup needs every requested field and normalizes owner-entered details without a verified flag', () => {
  const parsed = parseVehicle(details, 'driver');
  assert.equal(parsed.type, 'Toyota Corolla');
  assert.equal(parsed.plate, 'ABC 123');
  assert.equal('verified' in parsed, false);
  assert.equal(vehicleIsComplete(undefined, 'driver'), false);
  for (const key of ['type', 'color', 'photoBase64', 'plate', 'plateRegion'])
    assert.equal(vehicleIsComplete({ ...details, [key]: '' }, 'driver'), false);
  assert.equal(vehicleIsComplete(details, 'rider'), false);
});
test('vehicle photos are bounded JPEG data rather than a temporary device path or arbitrary URL', () => {
  for (const photoBase64 of ['file:///car.jpg', 'https://example.com/car.jpg', 'invalid', '/9j/' + 'A'.repeat(MAX_VEHICLE_PHOTO_LENGTH)])
    assert.equal(vehicleIsComplete({ ...details, photoBase64 }, 'driver'), false);
});
test('suggested departure comes from the supplied direct-road duration and rounds earlier', () => {
  assert.equal(suggestedStartMinute(540, 1800), 507);
  assert.equal(suggestedStartMinute(540, 1801), 506);
  for (const invalid of [NaN, Infinity, -1, 0]) assert.equal(suggestedStartMinute(540, invalid), null);
  assert.equal(suggestedStartMinute(20, 1800), null);
  assert.equal(suggestedStartMinute(Infinity, 1800), null);
});
