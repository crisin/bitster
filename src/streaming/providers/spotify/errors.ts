/**
 * Spotify answers 403 for very different reasons, and the response body is the
 * only way to tell them apart. Most importantly: an account that is NOT
 * allow-listed in the Developer Dashboard (development mode) gets a 403 that
 * looks exactly like "no Premium" unless the body is read.
 */

/** True when the 403 body says the user isn't allow-listed (development mode) */
export function isNotRegistered403(body: string): boolean {
  return /not\s+registered|development\s+mode|user\s+may\s+not\s+be\s+registered/i.test(
    body,
  );
}

/** Turn a 403 response body into an actionable message */
export function friendly403(body: string): string {
  if (isNotRegistered403(body)) {
    return (
      "This Spotify account is not allow-listed for bitster (the app runs in " +
      "Spotify's development mode). The host must add the EXACT email of THIS " +
      "Spotify account in the Spotify Developer Dashboard under User Management. " +
      "Run the Spotify check to see which account is connected."
    );
  }
  return (
    "Spotify Premium is required for playback. If this account has Premium, " +
    "run the Spotify check below to see which account is actually connected."
  );
}
