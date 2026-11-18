/**
 * The MCP transport for the MemQ tool surface.
 *
 * The surface itself lives in `_shared/memqTools.ts`, with no transport attached,
 * because the in-app AI chat needs the same tools and neither side should own them.
 * All this file does is register them on an McpServer and put each result on the
 * wire as MCP text content.
 */

import { McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { memqTools } from '../_shared/memqTools.ts';

/** Tool results travel as one JSON text block; the handlers return plain values. */
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

export function createMemqServer(supabase: SupabaseClient, userId: string) {
  const server = new McpServer({ name: 'MemQ', version: '0.2.0' });
  for (const tool of memqTools(supabase, userId)) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: tool.annotations,
    }, async (args: unknown) => result(await tool.run(args)));
  }
  return server;
}
