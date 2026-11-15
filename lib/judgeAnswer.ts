import { supabase } from '@/lib/supabase';

/**
 * Ask whether a typed answer means the same as the card's.
 *
 * Marking on the device (lib/answerCheck) compares words. This reads for meaning, and
 * is only asked when relaxed marking is on and the words left it open. It answers
 * true or false, or null when there is no answer to be had — offline, too slow, the
 * service down — and then the device's own mark stands and the person can overrule it.
 */
export async function judgeMeaning(
  question: string, expected: string, answer: string, timeoutMs = 7000,
): Promise<boolean | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const asked = supabase.functions.invoke('grade-answer', {
      body: { question: question.slice(0, 1200), expected: expected.slice(0, 1200), answer: answer.slice(0, 600) },
    }).then(({ data, error }) => (!error && typeof data?.correct === 'boolean' ? data.correct as boolean : null));
    const tooSlow = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
    return await Promise.race([asked, tooSlow]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
