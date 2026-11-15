import { validMcqPool, validTrueFalse } from './practiceOptions.ts';

Deno.test('accepts five or six concise unique options with the correct answer', () => {
  const options = ['甲', '乙', '丙', '丁', '戊', '己'];
  if (!validMcqPool(options, '甲') || !validMcqPool(options.slice(0, 5), '戊')) throw new Error('valid pool rejected');
});
Deno.test('rejects incomplete, duplicate, oversized and unmatched options', () => {
  for (const [options, answer] of [
    [['a', 'b', 'c', 'd'], 'a'], [['a', 'A', 'b', 'c', 'd'], 'a'],
    [['a', 'b', 'c', 'd', 'x'.repeat(101)], 'a'], [['a', 'b', 'c', 'd', 'e'], 'missing'],
  ] as const) {
    if (validMcqPool(options, answer)) throw new Error('invalid pool accepted');
  }
});
Deno.test('rejects clearly mixed scripts but allows shared technical acronyms', () => {
  if (validMcqPool(['植物制造养分', 'A planet', 'A sound', 'A law', 'A flower'], '植物制造养分')) throw new Error('mixed pool accepted');
  if (!validMcqPool(['RAG 方法', '模型微调', '数据压缩', '图像识别', 'AI 预测'], 'RAG 方法')) throw new Error('technical acronym rejected');
  if (validMcqPool(['AI', '中文选项', 'English option', 'Another option', 'Third option'], 'AI')) throw new Error('mixed distractors accepted for neutral answer');
  if (!validMcqPool(['AI', '中文选项', '另一个选项', '第三个选项', '第四个选项'], 'AI')) throw new Error('consistent distractors rejected for neutral answer');
});
Deno.test('true or false requires supported labels and compatible wording', () => {
  if (!validTrueFalse(['True', 'False'], 'True', 'Plants use light.')) throw new Error('valid question rejected');
  for (const [options, answer, question] of [
    [['False', 'True'], 'True', 'Plants use light.'],
    [['True', 'False'], 'Yes', 'Plants use light.'],
    [['True', 'False'], 'True', '植物利用光能制造养分。'],
  ] as const) {
    if (validTrueFalse(options, answer, question)) throw new Error('unsupported question accepted');
  }
});
