/**
 * One turn, as steps.
 *
 * This is the whole of what happens between "the gates let it through" and "the
 * stream closes", and it is here rather than inside the edge function so that it
 * can be run: against a scripted model in the tests, and against the real one in
 * supabase/functions/_harness/chat-harness.ts, with no database and no deploy in either.
 *
 *   1. Call the model with the line's tools. If the app already knows which tool
 *      this turn is for (a button was pressed), the first call may use no other.
 *   2. Words go to the screen as they arrive.
 *   3. No tool call: the turn is over.
 *   4. A tool call is run. What it returns decides what happens next:
 *        data  goes back to the model, and it is called again (back to 1)
 *        show  an interface is drawn, and the turn is over
 *        say   a sentence is shown, and the turn is over
 *   5. Out of rounds: say so, and stop.
 *
 * The model is never asked to do two things in a row that the server could have
 * done itself. Each "back to 1" is a full call that re-reads the whole prefix, so
 * the only one left is the one where the model genuinely needs to read something
 * before it can speak.
 */

import type { TokenUsage } from './chatCost.ts';
import type { ChatEvent } from './chatStream.ts';
import { toResponsesTools, type ChatTool } from './chatToolset.ts';

/**
 * How many times the model may be called again after reading a tool result.
 *
 * Two. The longest honest path is "read a lesson, then answer" or "read a lesson,
 * then draft" — one round — and the second is room for one correction after a bad
 * argument. It was six when a draft took four calls; an unused round costs
 * nothing, but a ceiling far above the real path is how a confused turn gets to
 * spend six calls before anyone is told.
 */
export const MAX_TOOL_ROUNDS = 2;

/** A ceiling on what one call may write. An explanation is eighty words and a
 *  draft call carries at most a page of material; past this something has gone
 *  wrong, and it should stop rather than be paid for. */
export const MAX_OUTPUT_TOKENS = 1600;

/** The few fields of the provider's stream this reads. Unknown events fall through. */
export type ModelEvent = {
  type?: string;
  delta?: string;
  response?: {
    output?: Array<Record<string, unknown>>;
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  };
};

export type ModelRequest = {
  input: Array<Record<string, unknown>>;
  tools: ReturnType<typeof toResponsesTools>;
  /** Set on the first call only, and only when the app named the tool. */
  toolChoice?: { type: 'function'; name: string };
};

export type RunDeps = {
  /** One streamed call to the model. Injected: the real one in the function and
   *  the harness, a script of events in the tests. */
  call: (request: ModelRequest) => Promise<AsyncIterable<ModelEvent>>;
  tools: ChatTool[];
  send: (event: ChatEvent) => void;
  /** A tool the first call must use, or null to let the model choose. */
  forced?: string | null;
};

export type RunResult = {
  /** The prose, as shown. What gets saved as the assistant's message. */
  answer: string;
  /** What was put on screen besides prose, in words, for the history: the model
   *  cannot see an interface, so the next turn has to be told one was shown. */
  notes: string[];
  /** The same interfaces as they were drawn, one for each note and in the same
   *  order. Kept for the screen, never for the model: reopened, a conversation
   *  has to draw its drafts again, and a sentence about them cannot be ticked. */
  shown: Array<{ id: string; component: string; props: unknown }>;
  toolCalls: number;
  /** How many times the model was called. The number to watch: it is the turn's
   *  cost in whole prefixes. */
  modelCalls: number;
  usage: TokenUsage;
};

type Call = { call_id: string; name: string; args: string };

const STUCK = 'I got stuck working that out. Could you say it another way?';

/** A turn that broke part-way still spent what it spent. The failure carries the
 *  tally so far, so the cost of a broken turn is recorded like any other. */
export class TurnFailed extends Error {
  constructor(readonly partial: RunResult) { super('upstream'); }
}

export async function runTurn(deps: RunDeps, input: Array<Record<string, unknown>>): Promise<RunResult> {
  const result: RunResult = {
    answer: '', notes: [], shown: [], toolCalls: 0, modelCalls: 0,
    usage: { prompt: 0, cached: 0, completion: 0 },
  };
  try {
    return await steps(deps, input, result);
  } catch {
    throw new TurnFailed(result);
  }
}

async function steps(deps: RunDeps, input: Array<Record<string, unknown>>, result: RunResult): Promise<RunResult> {
  const { send } = deps;
  const byName = new Map(deps.tools.map((tool) => [tool.name, tool]));
  const tools = toResponsesTools(deps.tools);
  const say = (text: string) => {
    // Its own paragraph when something was already said in this turn.
    const delta = result.answer.trim() ? `\n\n${text}` : text;
    result.answer += delta;
    send({ type: 'text', delta });
  };

  send({ type: 'status', status: 'thinking' });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forced = round === 0 && deps.forced && byName.has(deps.forced) ? deps.forced : null;
    const stream = await deps.call({
      input, tools,
      ...(forced ? { toolChoice: { type: 'function' as const, name: forced } } : {}),
    });
    result.modelCalls += 1;

    const calls: Call[] = [];
    let produced: Array<Record<string, unknown>> = [];
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        result.answer += event.delta;
        send({ type: 'text', delta: event.delta });
        continue;
      }
      if (event.type === 'response.failed' || event.type === 'response.incomplete') {
        throw new Error('upstream');
      }
      if (event.type === 'response.completed' && event.response) {
        const used = event.response.usage;
        result.usage.prompt += used?.input_tokens ?? 0;
        result.usage.completion += used?.output_tokens ?? 0;
        result.usage.cached += used?.input_tokens_details?.cached_tokens ?? 0;
        produced = event.response.output ?? [];
        for (const item of produced) {
          if (item.type === 'function_call' && typeof item.name === 'string') {
            calls.push({
              call_id: String(item.call_id ?? ''),
              name: item.name,
              args: typeof item.arguments === 'string' ? item.arguments : '{}',
            });
          }
        }
      }
    }

    if (!calls.length) return result;
    result.toolCalls += calls.length;

    send({ type: 'status', status: calls.some((call) => call.name === 'draft_cards') ? 'drafting' : 'reading' });

    const outputs: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      if (!tool) {
        outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: `${call.name} is not available here.` }) });
        continue;
      }
      let args: unknown;
      try { args = JSON.parse(call.args || '{}'); } catch { args = null; }
      let outcome;
      try {
        outcome = await tool.run(args);
      } catch {
        // A tool reports its own failures as results. One that throws anyway is a
        // bug here, and the person is told something they can act on, not that.
        outcome = { kind: 'data' as const, value: { error: 'That did not work.' } };
      }
      if (outcome.kind === 'show') {
        // Named here, before it is stored, so the screen holding it and the row
        // it will be kept in are known by the same name from the start.
        const id = crypto.randomUUID();
        send({ type: 'component', name: outcome.name, props: outcome.props, id });
        result.notes.push(outcome.note);
        result.shown.push({ id, component: outcome.name, props: outcome.props });
        return result;
      }
      if (outcome.kind === 'say') {
        say(outcome.text);
        return result;
      }
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(outcome.value) });
    }

    if (round === MAX_TOOL_ROUNDS) {
      say(STUCK);
      return result;
    }
    input.push(...produced, ...outputs);
  }
  return result;
}
