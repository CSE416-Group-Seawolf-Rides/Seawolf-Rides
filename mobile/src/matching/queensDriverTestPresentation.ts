import type { RiderDemoEvaluationResult } from './riderDemoEvaluation';
import type { RiderDemoCandidate } from './riderDemoFixtures';

export interface QueensDriverTestPresentationState {
  riders: RiderDemoCandidate[] | null;
  evaluating: boolean;
  token: number;
  result: RiderDemoEvaluationResult | null;
  selectedRiderId: string | null;
}

export type QueensDriverTestPresentationAction =
  | { type: 'INVALIDATE'; token: number }
  | { type: 'LOAD'; riders: RiderDemoCandidate[]; token: number }
  | { type: 'BEGIN'; token: number }
  | { type: 'COMPLETE'; result: RiderDemoEvaluationResult; token: number }
  | { type: 'CANCEL'; token: number }
  | { type: 'SELECT'; riderId: string };

export function createQueensDriverTestPresentationState(): QueensDriverTestPresentationState {
  return { riders: null, evaluating: false, token: 0, result: null, selectedRiderId: null };
}

/** Keeps input/load boundaries authoritative when older live requests finish late. */
export function queensDriverTestPresentationReducer(
  state: QueensDriverTestPresentationState,
  action: QueensDriverTestPresentationAction,
): QueensDriverTestPresentationState {
  switch (action.type) {
    case 'INVALIDATE':
      return { ...createQueensDriverTestPresentationState(), token: action.token };
    case 'LOAD':
      return { riders: action.riders, evaluating: false, token: action.token, result: null, selectedRiderId: null };
    case 'BEGIN':
      return state.riders && !state.evaluating ? { ...state, evaluating: true, token: action.token, result: null } : state;
    case 'COMPLETE': {
      if (!state.riders || !state.evaluating || action.token !== state.token) return state;
      const selected = [...action.result.candidates].sort(
        (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.candidate.id.localeCompare(b.candidate.id),
      )[0];
      return { ...state, evaluating: false, result: action.result, selectedRiderId: selected?.candidate.id ?? null };
    }
    case 'CANCEL':
      return { ...state, evaluating: false, token: action.token };
    case 'SELECT':
      return state.riders?.some((rider) => rider.id === action.riderId) ? { ...state, selectedRiderId: action.riderId } : state;
  }
}
