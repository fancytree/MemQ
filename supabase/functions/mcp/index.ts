import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createMcpHandler } from 'npm:@modelcontextprotocol/server@^2.0.0';
import { pipeline } from 'npm:@supabase/middleware@1';
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1';
import { createMemqServer } from './tools.ts';
import { isLocalPreviewEnabled } from './previewGate.ts';

const handler = pipeline(
  [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
  async (req, { supabase }) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response('Unauthorized', { status: 401 });
    const mcpHandler = createMcpHandler(() => createMemqServer(supabase, user.id));
    return mcpHandler.fetch(req);
  },
);

Deno.serve((req) => {
  if (!isLocalPreviewEnabled(Deno.env.get('MEMQ_UNSAFE_LOCAL_OAUTH_PREVIEW'), Deno.env.get('SUPABASE_URL'))) {
    return new Response('MCP is not available', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return handler(req);
});
