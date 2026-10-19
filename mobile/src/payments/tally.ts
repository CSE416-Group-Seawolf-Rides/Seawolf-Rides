import type { RideRequest } from '../mvp/rideRequestModel';
import type { PaymentMethod } from './paymentHandles';
import { parseRidePrice, type RidePrice } from './pricing';
import { rideHasFinished } from './rideCompletion';

// A rider telling the driver "I paid you $X for these rides". The driver can confirm it.
export interface Settlement {
  id: string;
  schemaVersion: 1;
  participantIds: string[];
  payerId: string;
  payeeId: string;
  payerName: string;
  payeeName: string;
  requestIds: string[];
  cents: number;
  // 'other' covers cash or anything outside the app links.
  method: PaymentMethod | 'other';
  status: 'MARKED_PAID' | 'CONFIRMED';
  createdAt: number;
  updatedAt: number;
}

export interface OwedRide {
  requestId: string;
  localDate: string;
  cents: number;
}

// One running balance per person and payment direction. Taking turns driving must
// never combine opposite debts into a single payment to one driver.
export interface Balance {
  counterpartId: string;
  counterpartName: string;
  // 'owe': you rode with them. 'owed': you drove them.
  direction: 'owe' | 'owed';
  // Rides that already happened and haven't been settled.
  due: OwedRide[];
  dueCents: number;
  // Accepted rides still ahead this week, shown so the total isn't a surprise.
  upcomingCents: number;
  // Payments marked as sent but not yet confirmed by the driver.
  awaitingConfirmation: Settlement[];
  // The most recent priced ride, so a driver can preview a price adjustment.
  latestPrice?: RidePrice;
  latestDate?: string;
}

function priced(request: RideRequest) {
  return parseRidePrice((request as RideRequest & { price?: unknown }).price);
}

export function computeBalances(
  uid: string,
  requests: RideRequest[],
  settlements: Settlement[],
  now: number,
  weekEnd: string,
): Balance[] {
  const settled = new Set(settlements.flatMap((settlement) => settlement.requestIds));
  const byPerson = new Map<string, Balance>();
  const keyFor = (counterpartId: string, direction: Balance['direction']) =>
    JSON.stringify([counterpartId, direction]);

  for (const request of requests) {
    const price = priced(request);
    if (request.status !== 'ACCEPTED' || !price || price.cents === 0) continue;
    if (request.driverId !== uid && request.riderId !== uid) continue;
    const owe = request.riderId === uid;
    const counterpartId = owe ? request.driverId : request.riderId;
    const direction = owe ? 'owe' : 'owed';
    const key = keyFor(counterpartId, direction);
    const balance =
      byPerson.get(key) ??
      ({
        counterpartId,
        counterpartName: owe ? request.driverName : request.riderName,
        direction,
        due: [],
        dueCents: 0,
        upcomingCents: 0,
        awaitingConfirmation: [],
      } satisfies Balance);
    if (!balance.latestPrice || request.localDate >= (balance.latestDate ?? '')) {
      balance.latestPrice = price;
      balance.latestDate = request.localDate;
    }
    if (settled.has(request.id)) {
      // Already paid or marked paid; nothing more to show for it.
    } else if (rideHasFinished(request, now)) {
      balance.due.push({ requestId: request.id, localDate: request.localDate, cents: price.cents });
      balance.dueCents += price.cents;
    } else if (request.localDate <= weekEnd) {
      balance.upcomingCents += price.cents;
    }
    byPerson.set(key, balance);
  }

  for (const settlement of settlements) {
    if (settlement.status !== 'MARKED_PAID') continue;
    if (settlement.payerId !== uid && settlement.payeeId !== uid) continue;
    const counterpartId = settlement.payerId === uid ? settlement.payeeId : settlement.payerId;
    const direction = settlement.payerId === uid ? 'owe' : 'owed';
    const key = keyFor(counterpartId, direction);
    const balance = byPerson.get(key) ?? {
      counterpartId,
      counterpartName: direction === 'owe' ? settlement.payeeName : settlement.payerName,
      direction,
      due: [],
      dueCents: 0,
      upcomingCents: 0,
      awaitingConfirmation: [],
    };
    balance.awaitingConfirmation.push(settlement);
    byPerson.set(key, balance);
  }

  return [...byPerson.values()]
    .map((balance) => ({ ...balance, due: balance.due.sort((a, b) => a.localDate.localeCompare(b.localDate)) }))
    .filter((b) => b.dueCents > 0 || b.upcomingCents > 0 || b.awaitingConfirmation.length > 0);
}

// What the driver has had covered this calendar month: shown as savings, not earnings.
export function coveredThisMonth(uid: string, settlements: Settlement[], monthPrefix: string): number {
  return settlements
    .filter(
      (s) =>
        s.payeeId === uid && s.status === 'CONFIRMED' &&
        new Date(s.createdAt * 1000).toISOString().slice(0, 7) === monthPrefix,
    )
    .reduce((sum, s) => sum + s.cents, 0);
}

export function parseSettlement(id: string, value: unknown): Settlement | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    typeof v.payerId !== 'string' ||
    typeof v.payeeId !== 'string' ||
    !Array.isArray(v.requestIds) ||
    !v.requestIds.every((r) => typeof r === 'string') ||
    !Number.isInteger(v.cents) ||
    !['venmo', 'paypal', 'zelle', 'other'].includes(String(v.method)) ||
    !['MARKED_PAID', 'CONFIRMED'].includes(String(v.status))
  )
    return undefined;
  return { ...(v as unknown as Settlement), id };
}

export function describeDates(dates: string[]): string {
  return dates
    .map((date) => {
      const [y, m, d] = date.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    })
    .join(', ');
}
