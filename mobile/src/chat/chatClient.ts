import { useEffect, useState } from 'react';
import { collection, doc, limitToLast, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFirestore, getFirebaseFunctions } from '../firebase/firebase';
import type { CalendarMatch } from '../calendar/calendarMatching';
import type { RideRequest } from '../mvp/rideRequestModel';
import type { ChatMatchDetails, ChatMessage, ChatThread } from './chatModel';

export async function startMatchChat(match: CalendarMatch, localDate: string) {
  return (await httpsCallable<unknown, { id: string }>(
    getFirebaseFunctions(), 'startMatchChat', { timeout: 120000 },
  )({ driverId: match.driverId, riderId: match.riderId, driverRevision: match.driverRevision,
    riderRevision: match.riderRevision, localDate })).data;
}
export function newMessageId() {
  return doc(collection(getFirebaseFirestore(), 'chats')).id;
}
export async function sendChatMessage(chatId: string, messageId: string, text: string) {
  await httpsCallable(getFirebaseFunctions(), 'sendChatMessage', { timeout: 120000 })({ chatId, messageId, text });
}
export function useChats(uid?: string) {
  const [state, setState] = useState<{ uid?: string; items: ChatThread[]; loaded: boolean; error?: string }>({ items: [], loaded: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(getFirebaseFirestore(), 'chats'), where('participantIds', 'array-contains', uid)),
      (snapshot) => setState({ uid, loaded: true, items: snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as ChatThread)
        .filter((thread) => thread.messageCount > 0 || !!thread.requestId)
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)) }),
      () => setState({ uid, loaded: true, items: [], error: 'Could not load your conversations.' }));
  }, [uid]);
  return state.uid === uid ? state : { items: [], loaded: false };
}
export function useChat(chatId: string, uid?: string) {
  const [window, setWindow] = useState({ chatId, size: 50 });
  const size = window.chatId === chatId ? window.size : 50;
  const [state, setState] = useState<{ key?: string; thread?: ChatThread; messages: ChatMessage[]; threadLoaded: boolean; messagesLoaded: boolean; error?: string }>({ messages: [], threadLoaded: false, messagesLoaded: false });
  const key = `${uid}:${chatId}`;
  useEffect(() => {
    if (!uid || !/^[a-f0-9]{64}$/.test(chatId)) return;
    const ref = doc(getFirebaseFirestore(), 'chats', chatId);
    let stopped = false;
    let stopMessages = () => {};
    const update = (patch: Partial<typeof state>) => {
      if (!stopped) setState((old) => ({
        ...(old.key === key ? old : { messages: [], threadLoaded: false, messagesLoaded: false }), key, ...patch,
      }));
    };
    const stop = onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        stopMessages();
        update({ thread: undefined, messages: [], threadLoaded: true, messagesLoaded: true, error: 'This conversation is unavailable.' });
        return;
      }
      update({ thread: { ...snapshot.data(), id: snapshot.id } as ChatThread, threadLoaded: true });
    }, () => {
      stopMessages();
      update({ thread: undefined, messages: [], threadLoaded: true, messagesLoaded: true, error: 'This conversation is unavailable to your account.' });
    });
    stopMessages = onSnapshot(query(collection(ref, 'messages'), orderBy('sequence'), limitToLast(size)),
      (messages) => update({ messagesLoaded: true,
        messages: messages.docs.map((d) => ({ ...d.data(), id: d.id }) as ChatMessage) }),
      () => update({ messages: [], messagesLoaded: true, error: 'Could not load this conversation.' }));
    return () => { stopped = true; stop(); stopMessages(); };
  }, [chatId, uid, key, size]);
  const current = !/^[a-f0-9]{64}$/.test(chatId)
    ? { messages: [], threadLoaded: true, messagesLoaded: true, thread: undefined, error: 'This conversation is unavailable.' }
    : state.key === key ? state : { messages: [], threadLoaded: false, messagesLoaded: false };
  return { ...current, hasEarlier: (current.thread?.messageCount ?? 0) > current.messages.length,
    loadEarlier: () => setWindow({ chatId, size: size + 50 }) };
}

/** Status comes from the original request, so accepts/cancels update on both clients. */
export function useChatRequest(requestId: string | undefined, uid?: string) {
  const key = `${uid}:${requestId}`;
  const [state, setState] = useState<{ key: string; request?: RideRequest; error?: string }>({ key: '' });
  useEffect(() => {
    if (!uid || !requestId) return;
    return onSnapshot(doc(getFirebaseFirestore(), 'rideRequests', requestId), (snapshot) => {
      setState({ key, ...(snapshot.exists() ? { request: { ...snapshot.data(), id: snapshot.id } as RideRequest }
        : { error: 'Trip context is unavailable.' }) });
    }, () => setState({ key, error: 'Could not load trip context.' }));
  }, [requestId, uid, key]);
  return !requestId ? { loading: false } : state.key === key ? { request: state.request, error: state.error, loading: false } : { loading: true };
}

export async function getChatMatch(chatId: string) {
  return (await httpsCallable<{ chatId: string }, ChatMatchDetails>(getFirebaseFunctions(), 'getChatMatch',
    { timeout: 120000 })({ chatId })).data;
}
