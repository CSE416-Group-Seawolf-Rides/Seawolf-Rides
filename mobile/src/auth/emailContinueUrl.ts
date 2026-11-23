// Where the "Continue" button on Firebase's email action page (verify email, reset
// password) should lead. The phone app has no web page to return to, so it sends the
// plain email; the browser build uses emailContinueUrl.web.ts.
export function emailContinueUrl(): string | undefined {
  return undefined;
}
