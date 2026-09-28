import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { CommuteDraft, emptyCommuteDraft } from './commuteModel';

interface CommuteDraftState {
  draft: CommuteDraft;
  updateDraft: (changes: Partial<CommuteDraft>) => void;
  resetDraft: (draft: CommuteDraft) => void;
}

const CommuteDraftContext = createContext<CommuteDraftState | null>(null);

interface CommuteDraftProviderProps extends PropsWithChildren {
  initialDraft?: CommuteDraft;
}

// Holds in-progress answers while someone moves through the commute steps, so going
// back and forth never loses what they entered.
export function CommuteDraftProvider({
  initialDraft = emptyCommuteDraft,
  children,
}: CommuteDraftProviderProps) {
  const [draft, setDraft] = useState<CommuteDraft>(initialDraft);

  const state = useMemo<CommuteDraftState>(
    () => ({
      draft,
      updateDraft: (changes) => setDraft((current) => ({ ...current, ...changes })),
      resetDraft: setDraft,
    }),
    [draft],
  );

  return <CommuteDraftContext.Provider value={state}>{children}</CommuteDraftContext.Provider>;
}

export function useCommuteDraft(): CommuteDraftState {
  const state = useContext(CommuteDraftContext);
  if (!state) {
    throw new Error('useCommuteDraft must be used within a CommuteDraftProvider');
  }
  return state;
}
