/** Whether a failure is the connection's rather than the app's or the server's.
 *
 * The app does not watch the network; it finds out the way anyone does, by asking
 * for something and not getting it. What comes back then is a fetch that never
 * left, and every layer that reports one — fetch itself, Supabase wrapping it —
 * says so in its message. Anything else that failed got an answer, which means
 * there was a connection to get it over.
 */
export function isOffline(failure: unknown): boolean {
  const message = typeof failure === 'string'
    ? failure
    : (failure as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string'
    && /network request failed|failed to fetch|network error|appears to be offline|load failed/i.test(message);
}
