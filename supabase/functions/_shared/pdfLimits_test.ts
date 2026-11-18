import { PDF_MAX_BYTES, PDF_PAGES_FREE, PDF_PAGES_PRO, pageRange, tooLarge } from './pdfLimits.ts';
import { CHAT_QUOTA } from './chatModes.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

Deno.test('how much of a PDF is read', () => {
  assert(PDF_MAX_BYTES === 20 * 1024 * 1024, 'twenty megabytes');
  // The processor's own format: from-to, counted from one.
  assert(pageRange(false) === '1-30' && PDF_PAGES_FREE === 30, pageRange(false));
  // Never more than the processor itself accepts.
  assert(pageRange(true) === '1-200' && PDF_PAGES_PRO <= 200, pageRange(true));
  const refusal = tooLarge();
  assert(refusal.code === 'too_large' && /20 MB/.test(refusal.message) && refusal.error === refusal.message, JSON.stringify(refusal));
});

Deno.test('chat is bounded for paying accounts too', () => {
  for (const [line, quota] of Object.entries(CHAT_QUOTA)) {
    assert(Number.isFinite(quota.pro) && quota.pro > quota.free, `${line} must have a ceiling for Pro above the free allowance`);
  }
  assert(CHAT_QUOTA.create.free === 30 && CHAT_QUOTA.practice.free === 60, 'the free allowances that were agreed');
});
