// Cost-share pricing. Riders cover a fair share of what driving actually costs (fuel plus car
// wear) for the miles they ride, all of their pickup detour, and a small pickup fee. Fuel alone
// made rides so cheap that picking someone up wasn't worth a driver's stop. It's still cost
// sharing, not a fare: no surge, and always capped below the IRS full cost of driving.
//
// Shared by the app and the trusted backend so both always show the same number.

export type FuelType = 'gas' | 'hybrid' | 'electric';

// Typical efficiencies when the driver hasn't entered their own. Gas/hybrid in miles per
// gallon, electric in miles per kWh.
export const DEFAULT_EFFICIENCY: Record<FuelType, number> = {
  gas: 28,
  hybrid: 48,
  electric: 3.5,
};
export const EFFICIENCY_LIMITS: Record<FuelType, { min: number; max: number; unit: string }> = {
  gas: { min: 10, max: 70, unit: 'mpg' },
  hybrid: { min: 25, max: 80, unit: 'mpg' },
  electric: { min: 1.5, max: 6, unit: 'mi/kWh' },
};

// IRS business mileage rate (Jul–Dec 2026): the recognized full cost of driving a mile.
// A gas share can never exceed it, which keeps prices clearly in cost-sharing territory.
export const IRS_RATE_USD_PER_MILE = 0.76;
export const ROUND_TO_CENTS = 25;
// Tires, maintenance and depreciation per mile. With fuel (~$0.15) it's about half the IRS rate.
export const WEAR_USD_PER_MILE = 0.25;
// Covers the stop and the coordination, so short trips are worth a driver's time.
export const PICKUP_FEE_CENTS = 100;
// Roughly a Zone 10 LIRR trip on a weekly pass ($33 / 10), without the walk to a station.
export const MINIMUM_CENTS = 300;
const METERS_PER_MILE = 1609.344;

export interface FuelPrices {
  gasUsdPerGallon: number;
  electricityUsdPerKwh: number;
  // Local date (YYYY-MM-DD) of the published gas price.
  gasWeekOf: string;
  source: 'EIA' | 'DEFAULT';
}

// New York averages from EIA: regular gas for the week of Oct 12, 2026 and residential
// electricity for July 2026. Used until the weekly refresh writes newer numbers.
export const DEFAULT_FUEL_PRICES: FuelPrices = {
  gasUsdPerGallon: 4.353,
  electricityUsdPerKwh: 0.299,
  gasWeekOf: '2026-10-12',
  source: 'DEFAULT',
};

export interface VehicleEfficiency {
  fuelType: FuelType;
  // Absent means "use the typical value for this fuel type".
  efficiency?: number;
}

export function effectiveEfficiency(vehicle: VehicleEfficiency | null | undefined): {
  fuelType: FuelType;
  efficiency: number;
  custom: boolean;
} {
  const fuelType = vehicle?.fuelType ?? 'gas';
  const custom = vehicle?.efficiency !== undefined;
  return { fuelType, efficiency: vehicle?.efficiency ?? DEFAULT_EFFICIENCY[fuelType], custom };
}

export function fuelCostPerMile(
  vehicle: VehicleEfficiency | null | undefined,
  prices: FuelPrices,
): number {
  const { fuelType, efficiency } = effectiveEfficiency(vehicle);
  return fuelType === 'electric'
    ? prices.electricityUsdPerKwh / efficiency
    : prices.gasUsdPerGallon / efficiency;
}

// The routed facts a price is based on; matching already computes all of them.
export interface PriceMetrics {
  sharedDistanceMeters: number;
  sharedDurationSeconds: number;
  riderInVehicleSeconds: number;
  driverExtraDistanceMeters: number;
}

// Stored on each request so a later gas update never changes an agreed price.
export interface RidePrice {
  /** The current amount was explicitly accepted by both participants. */
  negotiated?: boolean;
  // The pickup fee included in cents. Absent on older, fuel-only records.
  baseCents?: number;
  // What the rider pays: the suggestion with the driver's adjustment applied.
  cents: number;
  // The app's suggestion before any adjustment. Absent on older records (same as cents).
  suggestedCents?: number;
  // The driver's adjustment in percent: -100 is free; absent or 0 is the suggestion.
  adjustment?: number;
  riderMiles: number;
  extraMiles: number;
  costPerMile: number;
  fuelType: FuelType;
  gasWeekOf: string;
}

export function ridePrice(
  metrics: PriceMetrics,
  vehicle: VehicleEfficiency | null | undefined,
  prices: FuelPrices,
): RidePrice {
  const sharedMiles = Math.max(0, metrics.sharedDistanceMeters) / METERS_PER_MILE;
  const extraMiles = Math.max(0, metrics.driverExtraDistanceMeters) / METERS_PER_MILE;
  // Routing gives time in the car, not distance; the time share of the shared route is a
  // close stand-in for the distance the rider is aboard.
  const share =
    metrics.sharedDurationSeconds > 0
      ? Math.min(1, Math.max(0, metrics.riderInVehicleSeconds / metrics.sharedDurationSeconds))
      : 0;
  const riderMiles = sharedMiles * share;
  const costPerMile = fuelCostPerMile(vehicle, prices) + WEAR_USD_PER_MILE;

  // The rider splits the miles they ride with the driver, covers the detour in full, and adds
  // the pickup fee. Never above the IRS full cost of those miles; never below the minimum.
  const base = PICKUP_FEE_CENTS / 100;
  const raw = base + (riderMiles * costPerMile) / 2 + extraMiles * costPerMile;
  const cap = base + (riderMiles / 2 + extraMiles) * IRS_RATE_USD_PER_MILE;
  const cents = Math.max(
    MINIMUM_CENTS,
    Math.round((Math.min(raw, cap) * 100) / ROUND_TO_CENTS) * ROUND_TO_CENTS,
  );

  return {
    baseCents: PICKUP_FEE_CENTS,
    cents,
    riderMiles: round1(riderMiles),
    extraMiles: round1(extraMiles),
    costPerMile: Math.round(costPerMile * 1000) / 1000,
    fuelType: effectiveEfficiency(vehicle).fuelType,
    gasWeekOf: prices.gasWeekOf,
  };
}

// Drivers can lower the suggestion (or waive it) more freely than raise it. Lowering is
// generosity; raising past +25% would stop being "splitting gas". Fixed steps keep prices
// comparable between drivers and avoid odd amounts.
export const PRICE_ADJUSTMENTS = [-100, -50, -25, 0, 10, 25] as const;
export type PriceAdjustment = (typeof PRICE_ADJUSTMENTS)[number];

export function isPriceAdjustment(value: unknown): value is PriceAdjustment {
  return PRICE_ADJUSTMENTS.includes(value as PriceAdjustment);
}

export function adjustmentLabel(adjustment: PriceAdjustment | number | undefined): string {
  if (!adjustment) return 'Suggested';
  if (adjustment === -100) return 'Free';
  return `${adjustment > 0 ? '+' : '−'}${Math.abs(adjustment)}%`;
}

export function applyAdjustment(price: RidePrice, adjustment: PriceAdjustment | undefined): RidePrice {
  const suggestedCents = price.suggestedCents ?? price.cents;
  const pct = adjustment ?? 0;
  const capCents =
    (price.baseCents ?? 0) + (price.riderMiles / 2 + price.extraMiles) * IRS_RATE_USD_PER_MILE * 100;
  const raw = pct === -100 ? 0 : Math.min(suggestedCents * (1 + pct / 100), Math.max(capCents, suggestedCents));
  // Adjusted prices round down, in the rider's favor, so +25% can never become +33%.
  const cents = pct ? Math.floor(raw / ROUND_TO_CENTS) * ROUND_TO_CENTS : suggestedCents;
  const { adjustment: _previous, ...rest } = price;
  return { ...rest, cents, suggestedCents, ...(pct ? { adjustment: pct } : {}) };
}

// Plain-language note when a driver changed the suggestion, so riders always know why.
// `driverName` is null when the viewer is the driver.
export function adjustmentNote(price: RidePrice, driverName: string | null): string | undefined {
  if (price.negotiated) return 'Price agreed by both of you';
  const suggested = price.suggestedCents ?? price.cents;
  if (!price.adjustment || suggested === price.cents) return undefined;
  const who = driverName ?? 'You';
  if (price.cents === 0) return `${who} cover${driverName ? 's' : ''} the gas`;
  return price.cents < suggested
    ? `${who} lowered it from ${formatCents(suggested)}`
    : `includes ${driverName ? `${driverName}’s` : 'your'} ${adjustmentLabel(price.adjustment)} (suggested ${formatCents(suggested)})`;
}

export function formatCents(cents: number): string {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;
}

export function parseRidePrice(value: unknown): RidePrice | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const finite = (key: string) => typeof v[key] === 'number' && Number.isFinite(v[key]);
  if (
    !finite('cents') ||
    !Number.isInteger(v.cents) ||
    (v.cents as number) < 0 ||
    !finite('riderMiles') ||
    !finite('extraMiles') ||
    !finite('costPerMile') ||
    !['gas', 'hybrid', 'electric'].includes(String(v.fuelType)) ||
    typeof v.gasWeekOf !== 'string' ||
    (v.negotiated !== undefined && typeof v.negotiated !== 'boolean') ||
    (v.suggestedCents !== undefined && (!Number.isInteger(v.suggestedCents) || (v.suggestedCents as number) < 0)) ||
    (v.adjustment !== undefined && !isPriceAdjustment(v.adjustment)) ||
    (v.baseCents !== undefined && (!Number.isInteger(v.baseCents) || (v.baseCents as number) < 0))
  )
    return undefined;
  return v as unknown as RidePrice;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

// Reads just the efficiency fields from a vehicle record, even an unfinished one, so a driver
// can set their MPG without first adding a photo and plate.
export function vehicleEfficiencyFrom(value: unknown): VehicleEfficiency | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const fuelType = ['gas', 'hybrid', 'electric'].includes(String(v.fuelType))
    ? (v.fuelType as FuelType)
    : 'gas';
  const limits = EFFICIENCY_LIMITS[fuelType];
  const efficiency =
    typeof v.efficiency === 'number' &&
    Number.isFinite(v.efficiency) &&
    v.efficiency >= limits.min &&
    v.efficiency <= limits.max
      ? v.efficiency
      : undefined;
  return { fuelType, ...(efficiency !== undefined ? { efficiency } : {}) };
}
