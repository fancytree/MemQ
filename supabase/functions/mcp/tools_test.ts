import { createMcpHandler } from 'npm:@modelcontextprotocol/server@^2.0.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { createMemqServer } from './tools.ts';

const lessonId = 'fcb0cc9d-94a1-4d66-a748-830fc44fbaee';
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function backend(owner = 'user-a', lessonCount = 1) {
  const writes: Record<string, unknown>[] = [];
  const rpcCalls: Record<string, unknown>[] = [];
  return {
    writes, rpcCalls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        if (name === 'mcp_update_card') {
          if (owner !== 'user-a' || args.p_lesson_id !== lessonId || args.p_card_id !== lessonId) return { data: null, error: 'not accessible' };
          const changes = args.p_changes as Record<string, unknown>;
          writes.push({ action: 'update', table: 'terms', ...changes });
          return { data: { id: lessonId, ...changes }, error: null };
        }
        if (name === 'mcp_add_practice_questions') return { data: { questions_created: (args.p_questions as unknown[]).length }, error: null };
        return { data: { id: lessonId, cards_created: (args.p_cards as unknown[]).length }, error: null };
      },
      from(table: string) {
        const filters: Record<string, string> = {};
        let action = 'read';
        let changes: Record<string, unknown> = {};
        const q = {
          select() { return q; },
          update(value: Record<string, unknown>) { action = 'update'; changes = value; return q; },
          delete() { action = 'delete'; return q; },
          eq(key: string, value: string) { filters[key] = value; return q; },
          order() { return q; },
          async range(start: number, end: number) { const all = Array.from({ length: lessonCount }, (_, index) => ({ id: `${lessonId}-${index}`, name: `Test ${index}`, learning_mode: 'knowledge' })); return { data: filters.user_id === owner ? all.slice(start, end + 1) : [], error: null }; },
          async maybeSingle() {
            const allowed = table === 'lessons' ? filters.user_id === owner && filters.id === lessonId : filters.lesson_id === lessonId && owner === 'user-a';
            if (allowed && action !== 'read') writes.push({ action, table, ...changes });
            return { data: allowed ? { id: lessonId, name: 'Test', learning_mode: 'knowledge', content_revision: lessonId, ...changes } : null, error: null };
          },
          insert(rows: Record<string, unknown>[]) { writes.push(...rows); return { select: async () => ({ data: rows.map((row) => ({ id: lessonId, term: row.term })), error: null }) }; },
        };
        assert(table === 'lessons' || table === 'terms', 'unexpected table');
        return q;
      },
    } as unknown as SupabaseClient,
  };
}
async function call(client: SupabaseClient, name: string, args: unknown) {
  const handler = createMcpHandler(() => createMemqServer(client, 'user-a'));
  const response = await handler.fetch(new Request('http://localhost/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
  return await response.text();
}
Deno.test('create lesson sends cards to one atomic RPC', async () => {
  const fake = backend();
  const response = await call(fake.client, 'create_lesson', { name: 'Biology', cards: [{ term: 'Cell', definition: 'Basic unit of life' }] });
  assert(response.includes('cards_created'), response);
  assert(fake.rpcCalls.length === 1 && fake.writes.length === 0, 'creation must use one RPC');
  assert(fake.rpcCalls[0].p_learning_mode === 'knowledge', 'default mode is knowledge');
});

Deno.test('does not create a knowledge lesson with language details', async () => {
  const fake = backend();
  const response = await call(fake.client, 'create_lesson', { name: 'Italian', cards: [{ term: 'ciao', definition: 'hello', language_data: { language_code: 'it-IT' } }] });
  assert(response.includes('require a language lesson') && fake.rpcCalls.length === 0, response);
});

Deno.test('creates cards and both practice modes in a single atomic call', async () => {
  const fake = backend();
  const choice = { question_type: 'mcq', question_text: 'What is a cell?', options: ['Unit of life', 'A planet', 'A country', 'A color', 'A sound'], correct_answer: 'Unit of life' };
  const recall = { question_type: 'fill_blank', question_text: 'Define a cell.', correct_answer: 'Unit of life' };
  const entry = { term: 'Cell', definition: 'Unit of life', questions: [choice, recall] };
  const response = await call(fake.client, 'create_lesson_with_practice', { name: 'Biology', cards: [entry] });
  assert(response.includes('cards_created') && fake.rpcCalls.length === 1, response);
  const sent = fake.rpcCalls[0].p_cards as Array<{ questions: unknown[] }>;
  assert(sent.length === 1 && sent[0].questions.length === 2, 'card practice did not reach atomic RPC');
  const invalid = await call(fake.client, 'create_lesson_with_practice', { name: 'Biology', cards: [{ ...entry, questions: [choice] }] });
  assert((invalid.includes('error') || invalid.includes('isError')) && fake.rpcCalls.length === 1, 'card without recall was accepted');
});

Deno.test('updates owned lessons and cards with only requested fields', async () => {
  const fake = backend();
  const lesson = await call(fake.client, 'update_lesson', { lesson_id: lessonId, name: 'Updated' });
  const card = await call(fake.client, 'update_card', { lesson_id: lessonId, card_id: lessonId, definition: 'New definition' });
  assert(lesson.includes('Updated') && card.includes('New definition'), `${lesson} ${card}`);
  assert(fake.writes.length === 2 && fake.writes[0].name === 'Updated' && fake.writes[1].definition === 'New definition', 'updates not recorded');
});

Deno.test('rejects unconfirmed deletion and foreign lesson mutations', async () => {
  const fake = backend('user-b');
  const noConfirm = await call(fake.client, 'delete_lesson', { lesson_id: lessonId, confirm: false });
  const foreignLesson = await call(fake.client, 'update_lesson', { lesson_id: lessonId, name: 'Changed' });
  const foreignCard = await call(fake.client, 'delete_card', { lesson_id: lessonId, card_id: lessonId, confirm: true });
  assert(noConfirm.includes('error') || noConfirm.includes('isError'), noConfirm);
  assert(foreignLesson.includes('inaccessible') && foreignCard.includes('not accessible'), `${foreignLesson} ${foreignCard}`);
  assert(fake.writes.length === 0, 'unauthorized mutation');
});

Deno.test('deletes owned lesson and card only when confirmed', async () => {
  const fake = backend();
  const card = await call(fake.client, 'delete_card', { lesson_id: lessonId, card_id: lessonId, confirm: true });
  const lesson = await call(fake.client, 'delete_lesson', { lesson_id: lessonId, confirm: true });
  assert(card.includes('deleted_card') && lesson.includes('deleted_lesson'), `${card} ${lesson}`);
  assert(fake.writes.length === 2 && fake.writes.every((w) => w.action === 'delete'), 'deletions not recorded');
});
Deno.test('cannot add cards to another user’s lesson', async () => {
  const fake = backend('user-b');
  const response = await call(fake.client, 'add_cards', { lesson_id: lessonId, cards: [{ term: 'Cell', definition: 'Unit' }] });
  assert(response.includes('not found or not accessible'), response);
  assert(fake.writes.length === 0, 'unauthorized lesson was modified');
});
Deno.test('returns IDs for added cards and rejects language details for knowledge lessons', async () => {
  const fake = backend();
  const response = await call(fake.client, 'add_cards', { lesson_id: lessonId, cards: [{ term: 'Cell', definition: 'Unit' }] });
  assert(response.includes('cards_created'), response);
  assert(response.includes(lessonId) && fake.writes.length === 1 && fake.writes[0].language_data === null, 'missing card ID');
  const invalid = await call(fake.client, 'add_cards', { lesson_id: lessonId, cards: [{ term: 'Cell', definition: 'Unit', language_data: { language_code: 'en-US' } }] });
  assert(invalid.includes('require a language lesson') && fake.writes.length === 1, invalid);
});
Deno.test('rejects empty card definitions before writing', async () => {
  const fake = backend();
  const response = await call(fake.client, 'add_cards', { lesson_id: lessonId, cards: [{ term: 'Cell', definition: '  ' }] });
  assert(response.includes('isError') || response.includes('error'), response);
  assert(fake.writes.length === 0, 'invalid card was written');
});

Deno.test('saves generated questions and rejects overly long or ambiguous options', async () => {
  const fake = backend();
  const question = { card_id: lessonId, card_revision: lessonId, question_type: 'mcq', question_text: 'Choose the right meaning', options: ['One', 'Two', 'Three', 'Four', 'Five'], correct_answer: 'One' };
  const good = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [question] });
  assert(good.includes('questions_created') && fake.rpcCalls.length === 1, good);
  const tooLong = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, options: ['x'.repeat(101), 'Two', 'Three', 'Four', 'Five'] }] });
  const duplicate = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, options: ['One', 'one', 'Three', 'Four', 'Five'] }] });
  const absent = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, correct_answer: 'Missing' }] });
  const recallOptions = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, question_type: 'fill_blank' }] });
  const badTrueFalse = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, question_type: 'true_false', options: ['False', 'True'], correct_answer: 'True' }] });
  const chineseTrueFalse = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, question_type: 'true_false', question_text: '植物使用阳光制造养分。', options: ['True', 'False'], correct_answer: 'True' }] });
  const mixed = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, correct_answer: '植物制造养分', options: ['植物制造养分', 'A planet', 'A sound', 'A law', 'A flower'] }] });
  const mixedNeutral = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [{ ...question, correct_answer: 'AI', options: ['AI', '中文选项', 'A sound', 'A law', 'A flower'] }] });
  assert([tooLong, duplicate, absent, recallOptions, badTrueFalse, chineseTrueFalse, mixed, mixedNeutral].every((response) => response.includes('error') || response.includes('isError')), 'invalid question accepted');
  assert(fake.rpcCalls.length === 1, 'invalid question reached the database');
});

Deno.test('accepts a Chinese multiple-choice option pool', async () => {
  const fake = backend();
  const question = { card_id: lessonId, card_revision: lessonId, question_type: 'mcq', question_text: '什么是光合作用？', options: ['植物制造养分', '岩石受热熔化', '动物消化食物', '水分蒸发过程', '细胞发生分裂'], correct_answer: '植物制造养分' };
  const response = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [question] });
  assert(response.includes('questions_created') && fake.rpcCalls.length === 1, response);
});

Deno.test('accepts supported English true-false questions', async () => {
  const fake = backend();
  const question = { card_id: lessonId, card_revision: lessonId, question_type: 'true_false', question_text: 'Plants use light.', options: ['True', 'False'], correct_answer: 'True' };
  const response = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [question] });
  assert(response.includes('questions_created') && fake.rpcCalls.length === 1, response);
});

Deno.test('accepts shared technical acronyms in Chinese answers', async () => {
  const fake = backend();
  const question = { card_id: lessonId, card_revision: lessonId, question_type: 'mcq', question_text: '哪种方法结合检索与生成？', options: ['RAG 方法', '模型微调', '数据压缩', '图像识别', 'AI 预测'], correct_answer: 'RAG 方法' };
  const response = await call(fake.client, 'add_practice_questions', { lesson_id: lessonId, questions: [question] });
  assert(response.includes('questions_created') && fake.rpcCalls.length === 1, response);
});

Deno.test('publishes flat question objects in the MCP tool catalogue', async () => {
  const fake = backend();
  const handler = createMcpHandler(() => createMemqServer(fake.client, 'user-a'));
  const response = await handler.fetch(new Request('http://localhost/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) }));
  const raw = await response.text();
  const data = JSON.parse(raw.startsWith('event:') ? raw.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : raw);
  const expected = ['list_lessons', 'list_cards', 'create_lesson', 'create_lesson_with_practice', 'add_cards_with_practice', 'update_lesson', 'delete_lesson', 'add_cards', 'add_practice_questions', 'list_practice_questions', 'replace_practice_question', 'delete_practice_question', 'update_card', 'delete_card'];
  for (const name of expected) {
    assert(data.result.tools.some((entry: { name: string }) => entry.name === name), `missing tool: ${name}`);
  }
  for (const name of ['delete_lesson', 'delete_card', 'delete_practice_question']) {
    const tool = data.result.tools.find((entry: { name: string }) => entry.name === name);
    assert(tool?.annotations?.destructiveHint === true, `missing destructive annotation: ${name}`);
  }
  for (const name of ['create_lesson_with_practice', 'add_practice_questions', 'replace_practice_question']) {
    const tool = data.result.tools.find((entry: { name: string }) => entry.name === name);
    assert(tool?.inputSchema?.type === 'object', `missing object schema: ${name}`);
    const schema = JSON.stringify(tool.inputSchema);
    assert(!schema.includes('"oneOf"') && !schema.includes('"allOf"') && !schema.includes('"prefixItems"'), `complex question schema: ${name}`);
  }
});

Deno.test('lists all lessons across stable pages', async () => {
  const fake = backend('user-a', 3);
  const first = await call(fake.client, 'list_lessons', { limit: 2 });
  assert(first.includes('Test 0') && first.includes('Test 1') && !first.includes('Test 2') && first.includes('next_offset\\":2'), first);
  const second = await call(fake.client, 'list_lessons', { limit: 2, offset: 2 });
  assert(second.includes('Test 2') && !second.includes('Test 0') && second.includes('next_offset\\":null'), second);
});
