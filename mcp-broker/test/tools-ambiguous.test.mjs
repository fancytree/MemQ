import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMemqServer } from '../dist/tools.js';

test('ambiguous creation failures tell the client to check before retrying', async () => {
  const id = 'fcb0cc9d-94a1-4d66-a748-830fc44fbaee';
  const card = { term: 'Cell', definition: 'Basic unit of life' };
  const questions = [
    { question_type: 'mcq', question_text: 'What is a cell?', options: ['Unit of life', 'A planet', 'A color', 'A sound', 'A country'], correct_answer: 'Unit of life' },
    { question_type: 'fill_blank', question_text: 'Define a cell.', correct_answer: 'Unit of life' },
  ];
  let throwNetwork = false;
  const failure = async () => {
    if (throwNetwork) throw new Error('secret-provider-detail');
    return { data: null, error: { message: 'connection lost' } };
  };
  const client = {
    rpc: failure,
    from() {
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return { data: { id, name: 'Biology', learning_mode: 'knowledge' }, error: null }; },
        insert() { return { select: failure }; },
      };
      return query;
    },
  };
  const handler = createMcpHandler(() => createMemqServer(client, 'synthetic-owner'));
  const cases = [
    ['create_lesson', { name: 'Biology', cards: [card] }],
    ['create_lesson_with_practice', { name: 'Biology', cards: [{ ...card, questions }] }],
    ['add_cards_with_practice', { lesson_id: id, cards: [{ ...card, questions }] }],
    ['add_cards', { lesson_id: id, cards: [card] }],
    ['add_practice_questions', { lesson_id: id, questions: [{ ...questions[0], card_id: id, card_revision: id }] }],
  ];
  for (const [name, args] of cases) for (const throws of [false, true]) {
    throwNetwork = throws;
    const response = await handler.fetch(new Request('https://example.test/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }));
    const body = await response.text();
    assert.match(body, /result is unknown/i, name);
    assert.match(body, /before retrying/i, name);
    assert.doesNotMatch(body, /nothing was saved|no .* were saved/i, name);
    assert.doesNotMatch(body, /secret-provider-detail/, name);
  }
});
