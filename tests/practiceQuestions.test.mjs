import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSavedQuestion, isCurrentPracticeQuestion } from '../lib/practiceQuestions.ts';
import { fallbackOptions, compatibleAnswerScripts } from '../lib/quizLanguage.ts';
const base={term_id:'card',question_text:'Which is correct?',question_type:'mcq',options:['A','B','C','D','E','F'],correct_answer:'D',explanation:'Because.'};
test('samples four choices from a saved six-option pool and keeps the correct answer',()=>{
 const result=chooseSavedQuestion([base],'mcq',()=>0);
 assert.equal(result.mode,'mcq');
 assert.equal(result.opts.length,4);
 assert.equal(result.opts[result.correct],'D');
 assert.equal(new Set(result.opts).size,4);
 assert.ok(result.opts.every(option=>base.options.includes(option)));
});
test('samples four choices from a five-option pool for different random sequences',()=>{
 const question={...base,options:['A','B','C','D','E']};
 for (const random of [()=>0,()=>0.49,()=>0.99]) {
  const result=chooseSavedQuestion([question],'mcq',random);
  assert.equal(result.opts.length,4);
  assert.equal(result.opts[result.correct],'D');
 }
});
test('continues to display legacy four-option questions',()=>{
 const question={...base,options:['A','B','C','D']};
 const result=chooseSavedQuestion([question],'mcq',()=>0);
 assert.equal(result.opts.length,4);
 assert.equal(result.opts[result.correct],'D');
});
test('keeps true/false as two choices',()=>{
 const result=chooseSavedQuestion([{...base,question_type:'true_false',options:['True','False'],correct_answer:'False'}],'mcq',()=>0);
 assert.deepEqual(result.opts,['True','False']);
 assert.equal(result.correct,1);
});
test('uses saved recall questions and rejects malformed answers',()=>{
 assert.equal(chooseSavedQuestion([{...base,options:['A','B'],correct_answer:'missing'}],'mcq'),null);
 assert.equal(chooseSavedQuestion([{...base,options:['A','B','C'],correct_answer:'A'}],'mcq'),null);
 assert.deepEqual(chooseSavedQuestion([{...base,question_type:'fill_blank',options:null,correct_answer:'An answer'}],'recall'),{mode:'recall',q:'Which is correct?',answer:'An answer',explain:'Because.'});
});
test('returns null for missing questions so existing cards can use fallback',()=>{
 assert.equal(chooseSavedQuestion([],'mcq'),null);
});
test('recognizes questions authored for the current card revision',()=>{
 assert.equal(isCurrentPracticeQuestion({source_revision:'a',terms:{content_revision:'a'}}),true);
 assert.equal(isCurrentPracticeQuestion({source_revision:'a',terms:[{content_revision:'b'}]}),false);
 assert.equal(isCurrentPracticeQuestion({source_revision:null,terms:{content_revision:'a'}}),false);
 assert.equal(isCurrentPracticeQuestion({source_revision:'a',terms:null}),false);
});
test('rejects clearly mixed-script saved options while keeping same-language options',()=>{
 const chinese={...base,question_text:'什么是光合作用？',correct_answer:'植物利用光能制造养分',options:['植物利用光能制造养分','A legal rule','A sound wave','A planet','A living organ']};
 assert.equal(chooseSavedQuestion([chinese],'mcq'),null);
 const consistent={...chinese,options:['植物利用光能制造养分','细胞分裂的过程','水分蒸发的现象','岩石形成的过程','动物消化食物']};
 const selected=chooseSavedQuestion([consistent],'mcq',()=>0);
 assert.equal(selected?.mode,'mcq');
 assert.equal(selected?.opts.length,4);
 assert.equal(selected?.opts[selected.correct],consistent.correct_answer);
 assert.equal(compatibleAnswerScripts('植物的能量来源 ATP',['能量来源 ATP','一种化学反应']),true);
 assert.equal(compatibleAnswerScripts('RAG 方法',['检索方法','AI 技术','RAG']),true);
 assert.equal(compatibleAnswerScripts('RAG 方法',['English explanation']),false);
 assert.equal(compatibleAnswerScripts('AI',['AI','中文选项','English option']),false);
 assert.equal(compatibleAnswerScripts('AI',['AI','中文选项','另一个选项']),true);
});
test('fallback keeps distractors consistent when the answer is a shared acronym',()=>{
 const terms=[{id:'one',lesson_id:'a',definition:'AI'},{id:'two',lesson_id:'a',definition:'中文选项'},{id:'three',lesson_id:'a',definition:'First option'},{id:'four',lesson_id:'a',definition:'Second option'},{id:'five',lesson_id:'a',definition:'Third option'}];
 const result=fallbackOptions('AI','a','one',terms,()=>0);
 assert.equal(result?.opts.length,4);
 assert.equal(result?.opts.includes('中文选项'),false);
});
test('fallback uses only same-lesson, compatible options and never adds placeholders',()=>{
 const terms=[{id:'one',lesson_id:'a',definition:'中文正确答案'},{id:'two',lesson_id:'a',definition:'中文干扰选项一'},{id:'three',lesson_id:'a',definition:'中文干扰选项二'},{id:'four',lesson_id:'a',definition:'English answer'},{id:'five',lesson_id:'b',definition:'其他课程的答案'}];
 assert.equal(fallbackOptions(terms[0].definition,'a','one',terms),null);
 terms.push({id:'six',lesson_id:'a',definition:'中文干扰选项三'});
 const result=fallbackOptions(terms[0].definition,'a','one',terms,()=>0);
 assert.equal(result?.opts.length,4);
 assert.equal(result?.opts[result.correctIndex],terms[0].definition);
 assert.equal(result?.opts.includes('English answer'),false);
 assert.equal(result?.opts.includes('其他课程的答案'),false);
});
