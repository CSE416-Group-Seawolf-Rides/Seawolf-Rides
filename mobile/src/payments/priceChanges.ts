import { applyAdjustment, type RidePrice } from './pricing';

export type PriceChangeDecision = 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
export interface PriceChangeRequest {
  id: string;
  proposerId: string;
  recipientId: string;
  fromCents: number;
  toCents: number;
  status: 'PENDING' | PriceChangeDecision | 'EXPIRED';
  createdAt: number;
  updatedAt: number;
}

// Negotiations use the same cost-share ceiling as the existing +25% option.
// The original suggestion stays fixed across negotiations, so raises never compound.
export function maximumAgreedPrice(price: RidePrice): number {
  return Math.max(price.cents, applyAdjustment(price, 25).cents);
}

export function validProposedPrice(cents: unknown, price: RidePrice): cents is number {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents >= 0
    && cents % 25 === 0 && cents <= maximumAgreedPrice(price);
}

export function agreedPrice(price: RidePrice, cents: number): RidePrice {
  const { adjustment: _previous, ...rest } = price;
  return { ...rest, cents, suggestedCents: price.suggestedCents ?? price.cents, negotiated: true };
}
