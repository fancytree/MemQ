import { createClient } from '@supabase/supabase-js';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { isDirectUserSession } from './directSession.js';
import { revokeConnection } from './revokeConnection.js';

/** Only a verified direct app session can manage that user's broker grants. */
export async function handleConnections(req: Request, env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }, oauth: OAuthHelpers, coordinateRevoke?: (grant: string, owner: string) => Promise<boolean>): Promise<Response> {
  const authorization = req.headers.get('Authorization') || '';
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !isDirectUserSession(authorization)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const url = new URL(req.url);
  const headers = { 'Cache-Control': 'no-store' };
  if (url.pathname === '/connections' && req.method === 'GET') {
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor && cursor.length > 2048) return Response.json({ error: 'Invalid cursor' }, { status: 400, headers });
    const result = await oauth.listUserGrants(user.id, { limit: 50, cursor });
    const connections = await Promise.all(result.items.map(async (grant) => {
      const registered = await oauth.lookupClient(grant.clientId);
      return { id: grant.id, name: registered?.clientName || 'Connected app', createdAt: grant.createdAt };
    }));
    return Response.json({ connections, nextCursor: result.cursor || null }, { headers });
  }
  const match = /^\/connections\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
  if (match && req.method === 'DELETE') {
    // Persist coordinated denial before reporting success. An absent or
    // foreign coordinator cannot safely be distinguished from one that has
    // not initialized yet, so fail closed rather than falsely report success.
    // The provider helper keys grants by both user ID and grant ID.
    const revoked = await revokeConnection(match[1], user.id, (grant, owner) => oauth.revokeGrant(grant, owner), coordinateRevoke);
    if (!revoked) return Response.json({ error: 'Connection unavailable. Please try again.' }, { status: 503, headers });
    return new Response(null, { status: 204, headers });
  }
  return Response.json({ error: 'Not found' }, { status: 404, headers });
}
