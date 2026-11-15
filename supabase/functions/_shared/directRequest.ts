import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyDirectUser } from './directSession.ts';

/** Authenticate the request and exclude OAuth client tokens from direct-app endpoints. */
export async function isDirectAppRequest(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization) return false;
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return await verifyDirectUser(authorization, () => client.auth.getUser());
}
