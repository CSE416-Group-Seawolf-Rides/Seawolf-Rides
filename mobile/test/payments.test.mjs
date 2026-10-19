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
    plan: { vehicleCampusArrival: Date.parse(`${localDate}T12:00:00-04:00`) / 1000, riderDestinationArrival: Date.parse(`${localDate}T12:00:00-04:00`) / 1000 },
    status,
    riderId: rider,
    driverId: driver,
    riderName: rider === 'me' ? 'Gio' : 'Maya',
    driverName: driver === 'alex' ? 'Alex' : 'Gio',
    participantIds: [rider, driver],
    price: cents === undefined ? undefined : { cents, riderMiles: 1, extraMiles: 0, costPerMile: 0.15, fuelType: 'gas', gasWeekOf: '2026-10-12' },
  };
}

test('balances count completed rides as due, all future rides as upcoming, and skip settled ones', () => {
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
  const balances = computeBalances('me', requests, settlements, Date.parse('2026-10-15T15:00:00-04:00') / 1000);
  const alex = balances.find((b) => b.counterpartId === 'alex');
  assert.equal(alex.direction, 'owe');
  assert.deepEqual(alex.due.map((r) => r.requestId), ['wed']);
  assert.equal(alex.dueCents, 125);
  assert.equal(alex.upcomingCents, 200);
  assert.equal(alex.awaitingConfirmation.length, 1);
  const maya = balances.find((b) => b.counterpartId === 'maya');
  assert.equal(maya.direction, 'owed');
  assert.equal(maya.dueCents, 75);
});

test('drivers see what was covered this month', () => {
  const settlements = [
    { status: 'CONFIRMED', payeeId: 'me', cents: 300, createdAt: Date.UTC(2026, 9, 3) / 1000 },
    { status: 'CONFIRMED', payeeId: 'me', cents: 200, createdAt: Date.UTC(2026, 8, 30) / 1000 },
    { status: 'CONFIRMED', payeeId: 'alex', cents: 999, createdAt: Date.UTC(2026, 9, 3) / 1000 },
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

test('taking turns driving keeps payable rides and pending confirmations in their own direction', () => {
  const requests = [
    ride('i-rode', '2026-10-12', 300),
    ride('i-drove', '2026-10-13', 500, { driver: 'me', rider: 'alex' }),
  ];
  const sent = { id: 'sent', payerId: 'me', payeeId: 'alex', requestIds: [], cents: 100, status: 'MARKED_PAID' };
  const received = { id: 'received', payerId: 'alex', payeeId: 'me', requestIds: [], cents: 200, status: 'MARKED_PAID' };
  const now = Date.parse('2026-10-15T15:00:00-04:00') / 1000;
  for (const order of [requests, [...requests].reverse()]) {
    const balances = computeBalances('me', order, [sent, received], now);
    assert.equal(balances.length, 2);
    const owe = balances.find((b) => b.direction === 'owe');
    const owed = balances.find((b) => b.direction === 'owed');
    assert.equal(owe.dueCents, 300);
    assert.deepEqual(owe.due.map((r) => r.requestId), ['i-rode']);
    assert.deepEqual(owe.awaitingConfirmation.map((s) => s.id), ['sent']);
    assert.equal(owed.dueCents, 500);
    assert.deepEqual(owed.due.map((r) => r.requestId), ['i-drove']);
    assert.deepEqual(owed.awaitingConfirmation.map((s) => s.id), ['received']);
  }
});

test('today’s ride becomes due only after both agreed arrivals, including the exact boundary', () => {
  const request = ride('today', '2026-10-15', 300);
  const vehicleArrival = request.plan.vehicleCampusArrival;
  request.plan.riderDestinationArrival = vehicleArrival + 600;
  for (const now of [vehicleArrival - 3600, vehicleArrival, vehicleArrival + 599]) {
    const [balance] = computeBalances('me', [request], [], now);
    assert.equal(balance.dueCents, 0);
    assert.equal(balance.upcomingCents, 300);
  }
  const [finished] = computeBalances('me', [request], [], vehicleArrival + 600);
  assert.equal(finished.dueCents, 300);
  assert.equal(finished.upcomingCents, 0);
});

test('missing or invalid arrival times never make a ride payable', async () => {
  const { rideHasFinished } = await import('../src/payments/rideCompletion.ts');
  const now = Date.now() / 1000;
  for (const request of [undefined, {}, { plan: {} },
    { plan: { vehicleCampusArrival: NaN, riderDestinationArrival: 1 } },
    { plan: { vehicleCampusArrival: 1, riderDestinationArrival: Infinity } },
    { plan: { vehicleCampusArrival: 0, riderDestinationArrival: 1 } }]) {
    assert.equal(rideHasFinished(request, now), false);
  }
});

test('pending payments survive outstanding debt and absent ride snapshots', () => {
  const settlements = ['one', 'two'].map((id) => ({
    id, payerId: 'alex', payeeId: 'me', payerName: 'Alex', payeeName: 'Me',
    requestIds: [id], cents: 300, status: 'MARKED_PAID',
  }));
  const now = Date.parse('2026-10-15T15:00:00-04:00') / 1000;
  const requests = [ride('unpaid', '2026-10-12', 300, { driver: 'me', rider: 'alex' })];
  const [balance] = computeBalances('me', requests, settlements, now);
  assert.equal(balance.dueCents, 300);
  assert.deepEqual(balance.awaitingConfirmation.map((s) => s.id), ['one', 'two']);
  const [paymentsOnly] = computeBalances('me', [], settlements, now);
  assert.equal(paymentsOnly.counterpartName, 'Alex');
  assert.equal(paymentsOnly.awaitingConfirmation.length, 2);
});

test('monthly coverage counts confirmed receipts only', () => {
  const base = { payeeId: 'me', cents: 300, createdAt: Date.parse('2026-10-15T12:00:00Z') / 1000 };
  assert.equal(coveredThisMonth('me', [{ ...base, status: 'MARKED_PAID' }], '2026-10'), 0);
  assert.equal(coveredThisMonth('me', [{ ...base, status: 'MARKED_PAID' }, { ...base, status: 'CONFIRMED' }], '2026-10'), 300);
});

test('mutually agreed prices keep the original suggestion and never compound the negotiation ceiling', async () => {
  const { maximumAgreedPrice, validProposedPrice, agreedPrice } = await import('../src/payments/priceChanges.ts');
  const base = { cents: 300, baseCents: 100, suggestedCents: 300, riderMiles: 6, extraMiles: 1, costPerMile: .4, fuelType: 'gas', gasWeekOf: '2026-10-12', adjustment: -25 };
  assert.equal(maximumAgreedPrice(base), 375);
  for (const value of [0, 25, 250, 350, 375]) assert.equal(validProposedPrice(value, base), true);
  for (const value of [-25, 10, 400, NaN, Infinity, '350']) assert.equal(validProposedPrice(value, base), false);
  const changed = agreedPrice(base, 350);
  assert.equal(changed.negotiated, true);
  assert.equal(changed.adjustment, undefined);
  assert.equal(changed.suggestedCents, 300);
  assert.equal(maximumAgreedPrice(changed), 375);
  assert.equal(maximumAgreedPrice(agreedPrice(changed, 0)), 375);
  assert.equal(parseRidePrice(changed).cents, 350);
});
