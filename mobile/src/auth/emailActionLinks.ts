// Pure helpers for Firebase email actions (verification and password reset), kept free
// of Firebase imports so they can be unit tested.

export interface ContinueSettings {
  url: string;
}

/** The sign-in page on this site, for http(s) origins only. */
export function continueUrlFor(origin: string | undefined): string | undefined {
  if (typeof origin !== 'string' || !/^https?:\/\/[^/\s]+$/.test(origin)) return undefined;
  return `${origin}/email`;
}

/** Firebase errors that mean only the continue link was refused (e.g. a domain not yet authorized). */
export function isContinueUrlRejection(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : null;
  return (
    code === 'auth/unauthorized-continue-uri' ||
    code === 'auth/invalid-continue-uri' ||
    code === 'auth/missing-continue-uri'
  );
}

/**
 * Sends an email action with a link back to the site when there is one. If Firebase
 * refuses only that link, sends the plain email instead, so sign-up never fails over it.
 */
export async function sendWithContinueLink(
  continueUrl: string | undefined,
  send: (settings?: ContinueSettings) => Promise<void>,
): Promise<void> {
  if (!continueUrl) return send();
  try {
    await send({ url: continueUrl });
  } catch (error) {
    if (!isContinueUrlRejection(error)) throw error;
    await send();
  }
}

/** Added to every "we emailed you" message: campus mail can file these as junk. */
export const CHECK_SPAM_HINT = 'If it doesn’t arrive in a few minutes, check your spam or junk folder.';
