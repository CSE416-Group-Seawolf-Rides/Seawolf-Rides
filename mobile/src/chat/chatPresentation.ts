import type { ChatThread } from './chatModel';

/**
 * Formats a message or thread timestamp for the inbox thread list:
 * - Today: "3:45 PM"
 * - Yesterday: "Yesterday"
 * - Within 6 days: "Wed"
 * - Same year: "Oct 28"
 * - Previous year: "10/28/25"
 */
export function formatThreadTimestamp(timestampMs: number, nowMs: number = Date.now()): string {
  if (!timestampMs || isNaN(timestampMs)) return '';

  const date = new Date(timestampMs);
  const now = new Date(nowMs);

  const dateStr = date.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const nowStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  if (dateStr === nowStr) {
    return date.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const yesterday = new Date(nowMs - 86400000);
  const yesterdayStr = yesterday.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  if (dateStr === yesterdayStr) {
    return 'Yesterday';
  }

  const diffDays = Math.floor((nowMs - timestampMs) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
    });
  }

  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

/**
 * Formats message timestamp for inside chat bubbles: e.g. "3:45 PM".
 */
export function formatBubbleTime(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return '';
  return new Date(timestampMs).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns role badge information for a chat thread relative to current user.
 */
export function getThreadBadge(thread: ChatThread, currentUid: string): { label: string; isDriver: boolean } | null {
  if (thread.trip) {
    if (thread.trip.driverId === currentUid) {
      return { label: 'Rider', isDriver: false };
    }
    if (thread.trip.riderId === currentUid) {
      return { label: 'Driver', isDriver: true };
    }
  }
  return null;
}

