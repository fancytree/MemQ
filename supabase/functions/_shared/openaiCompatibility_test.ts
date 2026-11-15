import OpenAI from 'https://esm.sh/openai@6.49.0';
import { deepStrictEqual as assertEquals } from 'node:assert';
import { requestPractice } from './requestPractice.ts';

Deno.test('upgraded SDK preserves the question-generation request', async () => {
  let body: Record<string, unknown> | undefined;
  const client = new OpenAI({
    apiKey: 'test-only',
    maxRetries: 0,
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 0, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: '{"questions":[]}' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    },
  });
  const response = await client.chat.completions.create({
    model: 'gpt-6-luna', reasoning_effort: 'none', temperature: 0.7,
    messages: [{ role: 'system', content: 'Create questions.' }, { role: 'user', content: 'Example card.' }],
    response_format: { type: 'json_object' },
  });
  assertEquals(body?.reasoning_effort, 'none');
  assertEquals(body?.temperature, 0.7);
  assertEquals(body?.response_format, { type: 'json_object' });
  assertEquals(response.choices[0]?.message.content, '{"questions":[]}');
});

Deno.test('question requests retry malformed output with the same source and language rules', async () => {
  const bodies: any[] = [];
  const client = new OpenAI({ apiKey: 'test-only', maxRetries: 0, fetch: async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const content = bodies.length === 1 ? '{"questions":[]}' : JSON.stringify({ questions: [{ term_id: 'a', question_text: '问题', question_type: 'mcq', options: ['甲', '乙', '丙', '丁', '戊'], correct_answer: '甲' }] });
    return new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 0, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  } });
  const result = await requestPractice(client, 'gpt-6-luna', 'Use the card language.', 'Example card.', ['a']);
  assertEquals(result.questions.length, 1);
  assertEquals(bodies.length, 2);
  assertEquals(bodies[0].messages[0].content, 'Use the card language.');
  assertEquals(bodies[1].messages[0].content, 'Use the card language.');
  assertEquals(bodies[1].messages[1].content.includes('previous response was invalid'), true);
  assertEquals(bodies[1].response_format, { type: 'json_object' });
});
