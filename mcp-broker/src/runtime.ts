/** Fail closed unless the configured public origin matches the request and upstream is safe. */
export function validateBrokerRuntime(
  config: { BROKER_ENABLED?: string; BROKER_ORIGIN?: string; SUPABASE_URL?: string; SUPABASE_OAUTH_CLIENT_ID?: string; SUPABASE_ANON_KEY?: string; BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY?: string },
  requestUrl: string,
): string | null {
  if (config.BROKER_ENABLED !== 'true' || !config.BROKER_ORIGIN || !config.SUPABASE_URL ||
      !config.SUPABASE_OAUTH_CLIENT_ID || !config.SUPABASE_ANON_KEY ||
      config.SUPABASE_OAUTH_CLIENT_ID === 'local-unconfigured' || config.SUPABASE_ANON_KEY === 'local-unconfigured') return null;
  try {
    const origin = new URL(config.BROKER_ORIGIN);
    const request = new URL(requestUrl);
    const upstream = new URL(config.SUPABASE_URL);
    const localOrigin = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
    const localUpstream = upstream.protocol === 'http:' && ['localhost', '127.0.0.1', 'kong'].includes(upstream.hostname);
    // The current provider relies on eventually consistent KV. Remote operation
    // requires an explicit test-only acknowledgement until revocation and refresh
    // are backed by a verified strongly consistent design.
    if (!localOrigin && config.BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY !== 'true') return null;
    if ((!localOrigin && origin.protocol !== 'https:') || (upstream.protocol !== 'https:' && !(localOrigin && localUpstream))) return null;
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || request.origin !== origin.origin) return null;
    if (upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) return null;
    return origin.origin;
  } catch { return null; }
}

/** The unfinished coordinator integration is allowed only with a local origin and upstream. */
export function localCoordinatorTestAllowed(origin: string, upstream: string, hasCoordinator: boolean, hasKey: boolean): boolean {
  try {
    const brokerUrl = new URL(origin);
    const upstreamUrl = new URL(upstream);
    return brokerUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(brokerUrl.hostname) &&
      upstreamUrl.protocol === 'http:' && ['localhost', '127.0.0.1', 'kong'].includes(upstreamUrl.hostname) && hasCoordinator && hasKey;
  } catch { return false; }
}

/** Session envelopes use an unpadded base64url-encoded 32-byte AES key. */
export function validSessionEncryptionKey(secret: string | undefined): boolean {
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return false;
  try {
    const bytes = atob(secret.replace(/-/g, '+').replace(/_/g, '/') + '=');
    return bytes.length === 32 && btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === secret;
  } catch { return false; }
}

/** Fetching client metadata requires the Workers public-network-only guard. */
export function localCimdAllowed(coordinated: boolean, replayProtected: boolean, strictPublicFetch: boolean): boolean {
  return coordinated && replayProtected && strictPublicFetch;
}
