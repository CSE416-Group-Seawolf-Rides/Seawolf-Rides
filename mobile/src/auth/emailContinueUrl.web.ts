import { continueUrlFor } from './emailActionLinks';

// Browser version of emailContinueUrl.ts: after verifying or resetting, the "Continue"
// button returns to this site's email sign-in page (works on localhost, previews and
// seawolf-rides.web.app alike).
export function emailContinueUrl(): string | undefined {
  return typeof window === 'undefined' ? undefined : continueUrlFor(window.location.origin);
}
