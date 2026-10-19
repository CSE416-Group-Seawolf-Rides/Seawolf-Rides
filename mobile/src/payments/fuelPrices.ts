import { DEFAULT_FUEL_PRICES, type FuelPrices } from './pricing';

// EIA's weekly retail price for regular gasoline in New York State.
export const EIA_NY_REGULAR_GAS_SERIES = 'EMM_EPMR_PTE_SNY_DPG';
export const FUEL_PRICES_DOC = 'pricing/fuel';

export function eiaWeeklyGasUrl(apiKey: string): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[series][]': EIA_NY_REGULAR_GAS_SERIES,
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '1',
  });
  return `https://api.eia.gov/v2/petroleum/pri/gnd/data/?${params.toString()}`;
}

// Reads the newest row of an EIA v2 response. Values arrive as strings; anything outside a
// plausible pump price is rejected so a bad response can never reach a rider's price.
export function parseEiaLatestGas(json: unknown): { usdPerGallon: number; weekOf: string } {
  const rows = (json as { response?: { data?: unknown } } | null)?.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('EIA returned no rows.');
  const latest = [...rows]
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];
  const usdPerGallon = Number(latest?.value ?? latest?.price);
  const weekOf = String(latest?.period ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) throw new Error('EIA row has no weekly period.');
  if (!Number.isFinite(usdPerGallon) || usdPerGallon < 1 || usdPerGallon > 15)
    throw new Error('EIA gas price is outside a plausible range.');
  return { usdPerGallon, weekOf };
}

// Firestore document → prices, falling back to the published defaults when it's missing or
// malformed so pricing always works.
export function parseFuelPrices(value: unknown): FuelPrices {
  if (!value || typeof value !== 'object') return DEFAULT_FUEL_PRICES;
  const v = value as Record<string, unknown>;
  const gas = Number(v.gasUsdPerGallon);
  const electricity = Number(v.electricityUsdPerKwh);
  if (
    !Number.isFinite(gas) ||
    gas < 1 ||
    gas > 15 ||
    !Number.isFinite(electricity) ||
    electricity < 0.03 ||
    electricity > 2 ||
    typeof v.gasWeekOf !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.gasWeekOf)
  )
    return DEFAULT_FUEL_PRICES;
  return {
    gasUsdPerGallon: gas,
    electricityUsdPerKwh: electricity,
    gasWeekOf: v.gasWeekOf,
    source: v.source === 'EIA' ? 'EIA' : 'DEFAULT',
  };
}

export function formatWeekOf(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
