// Turns server errors from requesting, accepting, declining or cancelling a ride into a title,
// an explanation and a next step, instead of a raw message like "...Search again. [400]".

export interface RideErrorCopy {
  title: string;
  message: string;
}

type Action = 'accept' | 'decline' | 'cancel' | 'request';

function codeAndMessage(error: unknown): { code: string; text: string } {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const text = (error instanceof Error ? error.message : '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
  return { code: code.replace(/^functions\//, ''), text };
}

export function friendlyRideError(error: unknown, action: Action, partner: string): RideErrorCopy {
  const { code, text } = codeAndMessage(error);
  const lower = text.toLowerCase();
  const verb = { accept: 'accept', decline: 'decline', cancel: 'cancel', request: 'send' }[action];

  if (lower.includes('commute or calendar changed') || lower.includes('saved inputs changed'))
    return {
      title: 'Plans changed since this request',
      message:
        action === 'accept'
          ? `Your commute or ${partner}’s changed after this request was sent, so its times may not work anymore. Decline it and ask ${partner} to send a new one, or message them first.`
          : `Your commute or ${partner}’s changed. Search again to see an up-to-date trip.`,
    };
  if (lower.includes('proposed timing changed') || lower.includes('different times'))
    return {
      title: 'The trip times changed',
      message: `Traffic or a schedule update changed the pickup or arrival time, so this request can’t be accepted as-is. Ask ${partner} to send a new request with the current times.`,
    };
  if (lower.includes('departure has passed') || lower.includes('no longer pending'))
    return {
      title: 'This request has expired',
      message: 'The trip has already left or was answered. It’s moved to your history.',
    };
  if (lower.includes('insufficient passenger seats') || lower.includes('already committed') || lower.includes('already has'))
    return {
      title: 'No seat left for this day',
      message: `You already have a ride booked that day, or the car is full. ${partner} can look for another driver.`,
    };
  if (lower.includes('no longer feasible') || lower.includes('no longer compatible'))
    return {
      title: 'This trip no longer works',
      message: `With current schedules, there isn’t a pickup that gets both of you to campus on time.`,
    };
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'resource-exhausted' || lower.includes('network'))
    return {
      title: 'Couldn’t reach Seawolf Rides',
      message: 'Check your connection and try again in a moment.',
    };
  if (code === 'permission-denied')
    return { title: 'You can’t do that', message: text || `Only the person this request was sent to can ${verb} it.` };
  return { title: `Couldn’t ${verb} this request`, message: text || 'Something went wrong. Try again.' };
}
