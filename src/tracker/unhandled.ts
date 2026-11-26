/** Fetch's network failure text: Firefox, Chrome, Safari. */
const NETWORK_ERROR = /^(NetworkError when attempting to fetch resource|Failed to fetch|Load failed)/;

/**
 * Saves run from click handlers nobody awaits; say so when one fails instead of losing it quietly.
 * Network failures are skipped: saves are local, and sync retries on its own and shows "Offline".
 */
export function alertUnhandled(e: PromiseRejectionEvent): void {
  if (e.reason instanceof TypeError && NETWORK_ERROR.test(e.reason.message)) {
    console.warn('Network request failed; sync will retry:', e.reason);
    return;
  }
  alert(`Something went wrong, so your last change may not be saved: ${e.reason?.message ?? e.reason}`);
}
