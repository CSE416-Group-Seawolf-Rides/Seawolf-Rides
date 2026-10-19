import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FUEL_PRICES,
  effectiveEfficiency,
  formatCents,
  fuelCostPerMile,
  parseRidePrice,
  ridePrice,
  vehicleEfficiencyFrom,
} from '../src/payments/pricing.ts';
import { eiaWeeklyGasUrl, parseEiaLatestGas, parseFuelPrices } from '../src/payments/fuelPrices.ts';
import { normalizeHandle, parsePaymentHandles, paymentLink } from '../src/payments/paymentHandles.ts';
import { computeBalances, coveredThisMonth } from '../src/payments/tally.ts';

const MILE = 1609.344;
const prices = { gasUsdPerGallon: 4.2, electricityUsdPerKwh: 0.3, gasWeekOf: '2026-10-12', source: 'EIA' };

// 10 mi shared route; rider aboard for 80% of the time; driver detours 2 mi.
const metrics = {
  sharedDistanceMeters: 10 * MILE,
  sharedDurationSeconds: 1000,
  riderInVehicleSeconds: 800,
  driverExtraDistanceMeters: 2 * MILE,
};

test('a ride covers half of fuel + wear for shared miles, the full detour, and a pickup fee', () => {
  // 4.20 / 28 mpg = $0.15/mi fuel + $0.25 wear = $0.40/mi.
  // $1.00 pickup + 8 mi / 2 * 0.40 + 2 mi * 0.40 = 1.00 + 1.60 + 0.80 = $3.40 -> $3.50.
  const price = ridePrice(metrics, { fuelType: 'gas' }, prices);
  assert.equal(price.cents, 350);
  assert.equal(price.baseCents, 100);
  assert.equal(price.riderMiles, 8);
  assert.equal(price.extraMiles, 2);
  assert.equal(price.costPerMile, 0.4);
  assert.equal(price.gasWeekOf, '2026-10-12');
});

test('a custom MPG and an EV each change the cost per mile', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  close(fuelCostPerMile({ fuelType: 'gas', efficiency: 42 }, prices), 0.1);
  // 0.30 $/kWh / 3.0 mi/kWh = $0.10/mi; EVs are priced on electricity, never gas.
  close(fuelCostPerMile({ fuelType: 'electric', efficiency: 3 }, prices), 0.1);
  assert.equal(ridePrice(metrics, { fuelType: 'electric', efficiency: 3 }, prices).fuelType, 'electric');
  assert.deepEqual(effectiveEfficiency(null), { fuelType: 'gas', efficiency: 28, custom: false });
});

test('a cost share can never exceed the IRS cost of driving plus the pickup fee', () => {
  // 1 mpg would give $13.00; the cap holds it to $1.00 + (4 + 2) * 0.76 = $5.56 -> $5.50.
  const price = ridePrice(metrics, { fuelType: 'gas', efficiency: 1 }, { ...prices, gasUsdPerGallon: 1.75 });
  assert.equal(price.cents, 550);
});

test('very short or degenerate routes cost the $3.00 minimum instead of throwing', () => {
  const zero = ridePrice(
    { sharedDistanceMeters: 0, sharedDurationSeconds: 0, riderInVehicleSeconds: 0, driverExtraDistanceMeters: 0 },
    null,
    DEFAULT_FUEL_PRICES,
  );
  assert.equal(zero.cents, 300);
  assert.equal(formatCents(0), 'Free');
  assert.equal(formatCents(125), '$1.25');
});

test('stored prices and vehicle efficiency are read defensively', () => {
  assert.equal(parseRidePrice({ cents: 'x' }), undefined);
  assert.equal(parseRidePrice(ridePrice(metrics, null, prices)).cents, 350);
  assert.deepEqual(vehicleEfficiencyFrom({ fuelType: 'electric', efficiency: 99 }), { fuelType: 'electric' });
  assert.deepEqual(vehicleEfficiencyFrom({ fuelType: 'hybrid', efficiency: 50 }), { fuelType: 'hybrid', efficiency: 50 });
  assert.equal(vehicleEfficiencyFrom(undefined), null);
});

test('the weekly EIA response is parsed to the newest plausible NY gas price', () => {
  const parsed = parseEiaLatestGas({
    response: {
      data: [
        { period: '2026-10-05', value: '4.31' },
        { period: '2026-10-12', value: '4.353' },
      ],
    },
  });
  assert.deepEqual(parsed, { usdPerGallon: 4.353, weekOf: '2026-10-12' });
  assert.throws(() => parseEiaLatestGas({ response: { data: [{ period: '2026-10-12', value: '99' }] } }));
  assert.throws(() => parseEiaLatestGas({ response: { data: [] } }));
  assert.match(eiaWeeklyGasUrl('KEY'), /series.*EMM_EPMR_PTE_SNY_DPG/);
  assert.equal(parseFuelPrices({ gasUsdPerGallon: 'bad' }), DEFAULT_FUEL_PRICES);
  assert.equal(parseFuelPrices({ ...prices }).gasUsdPerGallon, 4.2);
});

test('payment usernames are normalized and invalid ones explain themselves', () => {
  assert.deepEqual(normalizeHandle('venmo', '@alex-chen'), { value: 'alex-chen' });
  assert.ok(normalizeHandle('venmo', 'a b').error);
  assert.deepEqual(normalizeHandle('paypal', 'https://paypal.me/AlexChen/'), { value: 'AlexChen' });
  assert.deepEqual(normalizeHandle('zelle', 'Alex@StonyBrook.edu'), { value: 'alex@stonybrook.edu' });
  assert.deepEqual(normalizeHandle('zelle', '(631) 555-0199'), { value: '6315550199' });
  assert.deepEqual(normalizeHandle('venmo', '  '), {});
  assert.deepEqual(parsePaymentHandles({ venmo: '@alex-chen', paypal: 'bad name!', zelle: 7 }), {
    venmo: 'alex-chen',
  });
});

test('pay links open Venmo and PayPal with the amount; Zelle is copied', () => {
  const venmo = paymentLink('venmo', 'alex-chen', 250, 'Seawolf Rides gas share');
  assert.equal(venmo.url, 'https://venmo.com/alex-chen?txn=pay&amount=2.50&note=Seawolf+Rides+gas+share');
  assert.equal(paymentLink('paypal', 'AlexChen', 250, '').url, 'https://paypal.me/AlexChen/2.50USD');
  assert.deepEqual(paymentLink('zelle', 'alex@stonybrook.edu', 250, ''), { copy: 'alex@stonybrook.edu' });
});

function ride(id, localDate, cents, { status = 'ACCEPTED', rider = 'me', driver = 'alex' } = {}) {
  return {
    id,
    localDate,
    status,
    riderId: rider,
    driverId: driver,
    riderName: rider === 'me' ? 'Gio' : 'Maya',
    driverName: driver === 'alex' ? 'Alex' : 'Gio',
    participantIds: [rider, driver],
    price: cents === undefined ? undefined : { cents, riderMiles: 1, extraMiles: 0, costPerMile: 0.15, fuelType: 'gas', gasWeekOf: '2026-10-12' },
  };
}

test('balances count past rides as due, later rides this week as upcoming, and skip settled ones', () => {
  const requests = [
    ride('mon', '2026-10-12', 100),
    ride('wed', '2026-10-14', 125),
    ride('fri', '2026-10-16', 100),
    ride('next', '2026-10-21', 100),
    ride('declined', '2026-10-13', 100, { status: 'DECLINED' }),
    ride('free', '2026-10-13', 0),
    ride('legacy', '2026-10-13', undefined),
    ride('maya', '2026-10-13', 75, { rider: 'maya', driver: 'me' }),
  ];
  const settlements = [
    { id: 's1', payerId: 'me', payeeId: 'alex', requestIds: ['mon'], cents: 100, method: 'venmo', status: 'MARKED_PAID', createdAt: 1_790_000_000 },
  ];
  const balances = computeBalances('me', requests, settlements, '2026-10-15', '2026-10-18');
  const alex = balances.find((b) => b.counterpartId === 'alex');
  assert.equal(alex.direction, 'owe');
  assert.deepEqual(alex.due.map((r) => r.requestId), ['wed']);
  assert.equal(alex.dueCents, 125);
  assert.equal(alex.upcomingCents, 100);
  assert.equal(alex.awaitingConfirmation.length, 1);
  const maya = balances.find((b) => b.counterpartId === 'maya');
  assert.equal(maya.direction, 'owed');
  assert.equal(maya.dueCents, 75);
});

test('drivers see what was covered this month', () => {
  const settlements = [
    { payeeId: 'me', cents: 300, createdAt: Date.UTC(2026, 9, 3) / 1000 },
    { payeeId: 'me', cents: 200, createdAt: Date.UTC(2026, 8, 30) / 1000 },
    { payeeId: 'alex', cents: 999, createdAt: Date.UTC(2026, 9, 3) / 1000 },
  ];
  assert.equal(coveredThisMonth('me', settlements, '2026-10'), 300);
});

test('drivers adjust within fixed steps: free, -50%, -25%, suggested, +10%, +25%', async () => {
  const { applyAdjustment, isPriceAdjustment, adjustmentLabel, adjustmentNote } = await import('../src/payments/pricing.ts');
  const suggested = ridePrice(metrics, { fuelType: 'gas' }, prices); // $3.50
  assert.equal(applyAdjustment(suggested, -100).cents, 0);
  assert.equal(applyAdjustment(suggested, -50).cents, 175);
  assert.equal(applyAdjustment(suggested, -25).cents, 250); // $2.625 rounds down
  assert.equal(applyAdjustment(suggested, 10).cents, 375); // $3.85 rounds down
  assert.equal(applyAdjustment(suggested, 25).cents, 425); // $4.375 rounds down
  const raised = applyAdjustment(suggested, 25);
  assert.equal(raised.suggestedCents, 350);
  assert.equal(raised.adjustment, 25);
  // Re-adjusting starts from the suggestion, never compounds.
  assert.equal(applyAdjustment(raised, -50).cents, 175);
  assert.equal('adjustment' in applyAdjustment(raised, undefined), false);
  assert.equal(isPriceAdjustment(40), false);
  assert.equal(isPriceAdjustment(-100), true);
  assert.equal(adjustmentLabel(-100), 'Free');
  assert.equal(adjustmentLabel(-25), '−25%');
  assert.equal(adjustmentNote(applyAdjustment(suggested, -25), 'Alex'), 'Alex lowered it from $3.50');
  assert.equal(adjustmentNote(applyAdjustment(suggested, -100), null), 'You cover the gas');
  assert.equal(adjustmentNote(raised, 'Alex'), 'includes Alex’s +25% (suggested $3.50)');
  assert.equal(parseRidePrice({ ...raised, adjustment: 40 }), undefined);
});

test('a raise still respects the IRS cost cap', async () => {
  const { applyAdjustment } = await import('../src/payments/pricing.ts');
  // 1 mi aboard, no detour: cap is 0.5 * 76¢ = 38¢; +25% of a 50¢ suggestion can't exceed it.
  const price = { cents: 50, riderMiles: 1, extraMiles: 0, costPerMile: 1, fuelType: 'gas', gasWeekOf: '2026-10-12' };
  assert.ok(applyAdjustment(price, 25).cents <= 50);
});

test('an adjusted price never exceeds its percentage because it rounds down', async () => {
  const { applyAdjustment } = await import('../src/payments/pricing.ts');
  const price = { cents: 150, riderMiles: 16, extraMiles: 1, costPerMile: 0.16, fuelType: 'gas', gasWeekOf: '2026-10-12' };
  assert.equal(applyAdjustment(price, 25).cents, 175); // $1.875 -> $1.75, not $2.00
  assert.equal(applyAdjustment(price, -25).cents, 100); // $1.125 -> $1.00
  assert.equal(applyAdjustment(price, undefined).cents, 150);
});
