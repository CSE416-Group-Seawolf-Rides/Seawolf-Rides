import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { getFirebaseFirestore } from '../firebase/firebase';
import {
  parseBlockedUser,
  validateReportInput,
  type BlockedUser,
  type CreateReportInput,
} from './safetyModel';

export async function blockUser(
  currentUid: string,
  targetId: string,
  targetName: string,
  database: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (!currentUid || !targetId || currentUid === targetId) {
    throw new Error('Invalid block request.');
  }
  const ref = doc(database, `users/${currentUid}/blockedUsers/${targetId}`);
  await setDoc(ref, {
    targetId,
    targetName: targetName.trim().slice(0, 80) || 'Stony Brook Commuter',
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(
  currentUid: string,
  targetId: string,
  database: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (!currentUid || !targetId) {
    throw new Error('Invalid unblock request.');
  }
  const ref = doc(database, `users/${currentUid}/blockedUsers/${targetId}`);
  await deleteDoc(ref);
}

export async function submitReport(
  reporterId: string,
  input: CreateReportInput,
  database: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (!reporterId) {
    throw new Error('Authentication required to submit report.');
  }
  const validated = validateReportInput(input);
  if (!validated.valid) {
    throw new Error(validated.error);
  }
  if (reporterId === validated.value.targetId) {
    throw new Error('You cannot report your own account.');
  }

  // Generate a client report id
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ref = doc(database, `reports/${reportId}`);

  const payload: Record<string, unknown> = {
    reporterId,
    targetId: validated.value.targetId,
    targetName: validated.value.targetName,
    reason: validated.value.reason,
    createdAt: serverTimestamp(),
  };
  if (validated.value.details) {
    payload.details = validated.value.details;
  }

  await setDoc(ref, payload);
}

export function subscribeToBlockedUsers(
  database: Firestore,
  uid: string,
  onValue: (blocked: BlockedUser[]) => void,
  onError: (error: unknown) => void,
): () => void {
  const colRef = collection(database, `users/${uid}/blockedUsers`);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: BlockedUser[] = [];
      for (const docSnap of snapshot.docs) {
        const parsed = parseBlockedUser(docSnap.data(), docSnap.id);
        if (parsed) items.push(parsed);
      }
      items.sort((a, b) => b.createdAt - a.createdAt);
      onValue(items);
    },
    onError,
  );
}

export function useBlockedUsers(uid: string | undefined): {
  blocked: BlockedUser[];
  loaded: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    uid?: string;
    blocked: BlockedUser[];
    loaded: boolean;
    error: string | null;
  }>({
    blocked: [],
    loaded: !uid,
    error: null,
  });

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = subscribeToBlockedUsers(
      getFirebaseFirestore(),
      uid,
      (blocked) => {
        if (active) setState({ uid, blocked, loaded: true, error: null });
      },
      () => {
        if (active) setState({ uid, blocked: [], loaded: true, error: 'Could not load blocked users.' });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid]);

  const activeMatch = state.uid === uid;
  return {
    blocked: activeMatch ? state.blocked : [],
    loaded: !uid || (activeMatch && state.loaded),
    error: activeMatch ? state.error : null,
  };
}

export function useIsBlocked(currentUid: string | undefined, targetId: string | undefined): boolean {
  const { blocked } = useBlockedUsers(currentUid);
  if (!targetId) return false;
  return blocked.some((b) => b.targetId === targetId);
}
