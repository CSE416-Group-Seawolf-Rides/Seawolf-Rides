import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import { parseDayOverride, type CalendarMode, type DayOverride } from './commuteCalendar';
import type { CalendarSearchResult } from './calendarMatching';

export function useCalendarOverrides(uid?: string) {
  const [state, setState] = useState<{
    uid?: string;
    days: Record<string, DayOverride>;
    error?: string;
    loaded: boolean;
  }>({ days: {}, loaded: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(getFirebaseFirestore(), 'users', uid, 'commuteDays'),
      (snapshot) => {
        try {
          const days: Record<string, DayOverride> = {};
          snapshot.docs.forEach((doc) => {
            const value = parseDayOverride(doc.data());
            if (value) days[doc.id] = value;
          });
          setState({ uid, days, loaded: true });
        } catch {
          setState({
            uid,
            days: {},
            error: 'Could not read calendar exceptions. Reload the app before editing.',
            loaded: false,
          });
        }
      },
      (error) => setState({ uid, days: {}, error: error.message, loaded: false }),
    );
  }, [uid]);
  return state.uid === uid ? state : { days: {} as Record<string, DayOverride>, loaded: false };
}
export async function saveCalendarDay(localDate: string, mode: CalendarMode | 'default') {
  await httpsCallable(getFirebaseFunctions(), 'setCommuteDay')({ localDate, mode });
}
export async function searchCalendar(localDate: string, cursor?: string) {
  const result = (
    await httpsCallable<{ localDate: string; cursor?: string }, CalendarSearchResult>(
      getFirebaseFunctions(),
      'findCommuteMatches',
      { timeout: 120000 },
    )({ localDate, ...(cursor ? { cursor } : {}) })
  ).data;
  if (result.policyVersion !== 2) throw new Error('Restart your local backend to load arrival-window matching, then search again.');
  return result;
}
