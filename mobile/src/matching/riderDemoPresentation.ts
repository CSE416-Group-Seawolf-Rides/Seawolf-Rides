import type { RiderDemoEvaluationResult } from './riderDemoEvaluation';
import type { RiderDemoCandidate, RiderDemoCaseId } from './riderDemoFixtures';

export interface RiderDemoPresentationState {
  caseId: RiderDemoCaseId;
  candidates: RiderDemoCandidate[] | null;
  evaluating: boolean;
  evaluationToken: number;
  result: RiderDemoEvaluationResult | null;
  selectedCandidateId: string | null;
}

export type RiderDemoPresentationAction =
  | { type: 'SELECT_CASE'; caseId: RiderDemoCaseId; token: number }
  | { type: 'LOAD'; candidates: RiderDemoCandidate[]; token: number }
  | { type: 'BEGIN_EVALUATION'; token: number }
  | {
      type: 'COMPLETE_EVALUATION';
      caseId: RiderDemoCaseId;
      result: RiderDemoEvaluationResult;
      token: number;
    }
  | { type: 'CANCEL_EVALUATION'; token: number }
  | { type: 'SELECT_CANDIDATE'; candidateId: string };

export function createRiderDemoPresentationState(
  caseId: RiderDemoCaseId = 'COMPARE_PICKUPS',
): RiderDemoPresentationState {
  return {
    caseId,
    candidates: null,
    evaluating: false,
    evaluationToken: 0,
    result: null,
    selectedCandidateId: null,
  };
}

/** Keeps case/load boundaries authoritative even if cancelled work resolves late. */
export function riderDemoPresentationReducer(
  state: RiderDemoPresentationState,
  action: RiderDemoPresentationAction,
): RiderDemoPresentationState {
  switch (action.type) {
    case 'SELECT_CASE':
      return {
        ...createRiderDemoPresentationState(action.caseId),
        evaluationToken: action.token,
      };
    case 'LOAD':
      return {
        ...state,
        candidates: action.candidates,
        evaluating: false,
        evaluationToken: action.token,
        result: null,
        selectedCandidateId: null,
      };
    case 'BEGIN_EVALUATION':
      if (!state.candidates || state.evaluating) return state;
      return { ...state, evaluating: true, evaluationToken: action.token };
    case 'COMPLETE_EVALUATION': {
      if (
        action.token !== state.evaluationToken ||
        action.caseId !== state.caseId ||
        !state.candidates
      ) {
        return state;
      }
      const first = [...action.result.candidates]
        .sort(
          (a, b) =>
            (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
            a.candidate.id.localeCompare(b.candidate.id),
        )[0];
      return {
        ...state,
        evaluating: false,
        result: action.result,
        selectedCandidateId: first?.candidate.id ?? null,
      };
    }
    case 'CANCEL_EVALUATION':
      return {
        ...state,
        evaluating: false,
        evaluationToken: action.token,
      };
    case 'SELECT_CANDIDATE':
      return state.candidates?.some((candidate) => candidate.id === action.candidateId)
        ? { ...state, selectedCandidateId: action.candidateId }
        : state;
  }
}
