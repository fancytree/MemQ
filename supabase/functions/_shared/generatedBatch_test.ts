import { generateValidBatch } from './generatedBatch.ts';

Deno.test('retries malformed questions once and returns the corrected batch', async () => {
  const calls: boolean[] = [];
  const result = await generateValidBatch((repair) => {
    calls.push(repair);
    return Promise.resolve(JSON.stringify({ questions: [{ term_id: 'a', question_text: '问题', question_type: 'mcq', options: repair ? ['甲', '乙', '丙', '丁', '戊'] : ['甲', 'English', '丙', '丁', '戊'], correct_answer: '甲' }] }));
  }, ['a']);
  if (calls.join(',') !== 'false,true' || result.questions.length !== 1) throw new Error('retry failed');
});
Deno.test('rejects incomplete batches and does not exceed two attempts', async () => {
  let calls = 0;
  try {
    await generateValidBatch(() => { calls++; return Promise.resolve('{"questions":[]}'); }, ['a']);
    throw new Error('invalid batch accepted');
  } catch (error) {
    if (calls !== 2 || !(error instanceof Error) || !error.message.includes('Could not generate')) throw error;
  }
});
Deno.test('upstream failures are not retried as malformed content', async () => {
  let calls = 0;
  try { await generateValidBatch(() => { calls++; return Promise.reject(new Error('offline')); }, ['a']); }
  catch (error) { if (calls === 1 && error instanceof Error && error.message === 'offline') return; throw error; }
  throw new Error('failure was swallowed');
});
