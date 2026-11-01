import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { Screen } from '../components/Screen';
import { SaveCoordinator, SavePendingError } from '../persistence/saveCoordinator';
import { colors, spacing } from '../theme';

export function accountBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/account');
}

export function AccountMemberPage({ title, children }: { title: string; children: (uid: string) => ReactNode }) {
  const { user, isGuest } = useSession();
  if (!user || isGuest) {
    return <Screen onBack={accountBack} title={title}><Text style={accountStyles.body}>Sign in with your verified Stony Brook account to use this feature.</Text></Screen>;
  }
  return children(user.id);
}

/** Keep queued writes attached to their original operation after a UI timeout. */
export function useConfirmedAction() {
  const coordinator = useRef(new SaveCoordinator());
  const active = useRef(true);
  const lock = useRef(false);
  const lastAction = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function run(key: string, operation: () => Promise<void>, onSuccess: () => void) {
    if (lock.current) return;
    lastAction.current = () => { void run(key, operation, onSuccess); };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await coordinator.current.run(key, async () => {
        if (active.current) setPending(true);
        try {
          await operation();
          if (active.current) { onSuccess(); setError(''); }
        } finally {
          if (active.current) setPending(false);
        }
      });
    } catch (failure) {
      if (active.current) setError(failure instanceof SavePendingError
        ? 'Still waiting for confirmation. Keep the app open and reconnect, then check again.'
        : 'Couldn’t save. Check your connection and try again.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, pending, error, run, retry: () => lastAction.current?.() };
}

export const accountStyles = StyleSheet.create({
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', lineHeight: 25 },
  section: { gap: spacing.md },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  success: { color: colors.success, fontSize: 14, lineHeight: 21 },
  caption: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
