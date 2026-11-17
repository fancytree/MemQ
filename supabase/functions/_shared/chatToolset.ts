/**
 * The tools one chat line may use, in the shape the model wants them.
 *
 * Three sources meet here and come out as one list:
 *   - the shared MemQ surface (`memqTools`), filtered to the line's whitelist
 *   - `draft_lesson`, which belongs to chat alone: the MCP side has no use for it,
 *     because an external AI drafts cards in its own context, on its own bill
 *   - the interfaces from `chatComponents`, which run on the client
 *
 * Keeping this assembly in one pure function means the whitelist can be tested as
 * data: what a line can reach, and what it cannot, is an assertion rather than a
 * careful reading of the edge function.
 */

import { z } from 'npm:zod@^4.3.6';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { memqTools } from './memqTools.ts';
import { CHAT_COMPONENTS, isChatComponent, type ChatComponentName } from './chatComponents.ts';
import { CHAT_TOOLS, type ChatMode, type ChatToolKind } from './chatModes.ts';
import { draftLessonInput } from './draftLesson.ts';

export type ChatTool = {
  name: string;
  kind: ChatToolKind;
  description: string;
  /** JSON Schema, as the model sees it. */
  parameters: Record<string, unknown>;
  /** Server tools only. A client tool has nothing to run here by definition. */
  run?: (args: unknown) => Promise<unknown>;
};

export type ToolsetDeps = {
  supabase: SupabaseClient;
  userId: string;
  /** Injected rather than built here, because drafting needs the caller's token and
   *  a fetch, neither of which belongs in a tool table. */
  draft: (args: unknown) => Promise<unknown>;
};

function schemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

export function chatToolset(mode: ChatMode, deps: ToolsetDeps): ChatTool[] {
  const wanted = CHAT_TOOLS[mode];
  const shared = new Map(memqTools(deps.supabase, deps.userId).map((tool) => [tool.name, tool]));
  const tools: ChatTool[] = [];

  for (const [name, kind] of Object.entries(wanted)) {
    if (kind === 'client') {
      // A component the whitelist names but chatComponents does not define would be
      // a tool the app cannot draw; the test for this is in chat_test.ts.
      if (!isChatComponent(name)) continue;
      const component = CHAT_COMPONENTS[name as ChatComponentName];
      tools.push({ name, kind, description: component.description, parameters: schemaOf(component.props) });
      continue;
    }
    if (name === 'draft_lesson') {
      tools.push({
        name, kind,
        description: 'Draft cards for a topic without saving anything. Returns the drafted cards; show them with show_card_drafts so the person can choose. Does not create a lesson and does not save cards.',
        parameters: schemaOf(draftLessonInput),
        run: deps.draft,
      });
      continue;
    }
    const tool = shared.get(name);
    if (!tool) continue;
    tools.push({ name, kind, description: tool.description, parameters: schemaOf(tool.input), run: tool.run });
  }
  return tools;
}

/** The provider's tool shape. `strict` is off because these schemas use unions and
 *  optional fields that strict mode will not accept; the arguments are validated by
 *  zod on the way in regardless, so nothing reaches a handler unchecked. */
export function toResponsesTools(tools: ChatTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
}
