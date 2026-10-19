import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';

import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import { FUEL_PRICES_DOC, parseFuelPrices } from './fuelPrices';
import { parsePaymentHandles, type PaymentHandles, type PaymentMethod } from './paymentHandles';
import {
  DEFAULT_FUEL_PRICES,
  isPriceAdjustment,
  type PriceAdjustment,
  vehicleEfficiencyFrom,
  type FuelPrices,
  type FuelType,
  type VehicleEfficiency,
} from './pricing';
import { parseSettlement, type Settlement } from './tally';
import type { PriceChangeDecision } from './priceChanges';

// Live document → parsed value, with a fallback while loading or when reading fails.
function useDocument<T>(path: string | null, parse: (value: unknown) => T, fallback: T) {
  const [state, setState] = useState<{ path: string | null; value: T; loaded: boolean }>({
    path: null,
    value: fallback,
    loaded: false,
  });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(getFirebaseFirestore(), path),
      (snapshot) => setState({ path, value: parse(snapshot.data()), loaded: true }),
      () => setState({ path, value: fallback, loaded: true }),
    );
    // parse and fallback are module-level constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return state.path === path ? state : { value: fallback, loaded: false };
}

export function useFuelPrices(signedIn: boolean): FuelPrices {
  return useDocument(signedIn ? FUEL_PRICES_DOC : null, parseFuelPrices, DEFAULT_FUEL_PRICES).value;
}

export function useOwnPaymentHandles(uid?: string) {
  return useDocument<PaymentHandles>(uid ? `paymentHandles/${uid}` : null, parsePaymentHandles, {});
}

export function useOwnVehicleEfficiency(uid?: string) {
  return useDocument<VehicleEfficiency | null>(
    uid ? `users/${uid}/vehicles/primary` : null,
    vehicleEfficiencyFrom,
    null,
  );
}

export function usePriceAdjustment(driverId?: string, riderId?: string) {
  return useDocument<PriceAdjustment>(
    driverId && riderId ? `priceAdjustments/${driverId}_${riderId}` : null,
    readAdjustment,
    0,
  );
}
function readAdjustment(value: unknown): PriceAdjustment {
  const adjustment = (value as { adjustment?: unknown } | undefined)?.adjustment;
  return isPriceAdjustment(adjustment) ? adjustment : 0;
}

export async function setPriceAdjustment(riderId: string, adjustment: PriceAdjustment) {
  return (await call<{ riderId: string; adjustment: PriceAdjustment }, { adjustment: PriceAdjustment; lowered: number }>(
    'setPriceAdjustment',
  )({ riderId, adjustment })).data;
}

export function useSettlements(uid?: string) {
  const [state, setState] = useState<{ uid?: string; items: Settlement[]; loaded: boolean }>({
    items: [],
    loaded: false,
  });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(getFirebaseFirestore(), 'settlements'),
        where('participantIds', 'array-contains', uid),
      ),
      (snapshot) =>
        setState({
          uid,
          loaded: true,
          items: snapshot.docs.flatMap((d) => parseSettlement(d.id, d.data()) ?? []),
        }),
      () => setState({ uid, items: [], loaded: true }),
    );
  }, [uid]);
  return state.uid === uid ? state : { items: [] as Settlement[], loaded: false };
}

const call = <I, O>(name: string) => httpsCallable<I, O>(getFirebaseFunctions(), name);

export async function saveFuelEfficiency(fuelType: FuelType, efficiency: number | null) {
  await call('saveFuelEfficiency')({ fuelType, efficiency });
}

export async function savePaymentHandles(handles: PaymentHandles) {
  await call('savePaymentHandles')(handles);
}

export async function getPayeeHandles(payeeId: string): Promise<PaymentHandles> {
  const result = await call<{ payeeId: string }, { handles: PaymentHandles }>('getPayeeHandles')({ payeeId });
  return parsePaymentHandles(result.data.handles);
}

export async function recordSettlement(
  payeeId: string,
  requestIds: string[],
  method: PaymentMethod | 'other',
  expectedCents: number,
) {
  await call('recordSettlement')({ payeeId, requestIds, method, expectedCents });
}

export const newPriceProposalId = () => doc(collection(getFirebaseFirestore(), 'rideRequests')).id;

export async function proposeRidePriceChange(requestId: string, proposalId: string, cents: number, expectedCents: number) {
  await call('proposeRidePriceChange')({ requestId, proposalId, cents, expectedCents });
}

export async function respondToRidePriceChange(requestId: string, proposalId: string, decision: PriceChangeDecision) {
  await call('respondToRidePriceChange')({ requestId, proposalId, decision });
}

export async function confirmSettlement(settlementId: string) {
  await call('confirmSettlement')({ settlementId });
}
