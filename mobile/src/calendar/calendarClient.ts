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
export async function searchCalendar(
  localDate: string,
  cursor?: string,
  direction: 'TO_CAMPUS' | 'FROM_CAMPUS' = 'TO_CAMPUS',
) {
  const callable = httpsCallable<
    { localDate: string; cursor?: string; direction?: 'TO_CAMPUS' | 'FROM_CAMPUS' },
    CalendarSearchResult
  >(getFirebaseFunctions(), 'findCommuteMatches', { timeout: 120000 });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await callable({ localDate, direction, ...(cursor ? { cursor } : {}) });
      const result = response.data;
      if (result.policyVersion !== 3)
        throw new Error('Restart your local backend to load buffered arrivals and drop-off preferences, then search again.');
      return result;
    } catch (error: any) {
      const isBusy =
        error?.code === 'functions/resource-exhausted' ||
        error?.code === 'resource-exhausted' ||
        (typeof error?.message === 'string' &&
          (error.message.includes('429') ||
            error.message.includes('Demo routing is busy') ||
            error.message.includes('resource-exhausted')));
      if (isBusy && attempt < 2) {
        // Wait for the backend demo cooldown to clear before retrying seamlessly
        await new Promise((resolve) => setTimeout(resolve, 1400));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Demo routing is busy. Please try again.');
}
