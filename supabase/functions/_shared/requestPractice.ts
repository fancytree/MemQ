import type OpenAI from 'https://esm.sh/openai@6.49.0';
import { generateValidBatch } from './generatedBatch.ts';

/** `onUsage` is told what each attempt cost. A batch that had to be repaired was
 *  paid for twice, and the caller is the one keeping the tally (aiGate.ts). */
export function requestPractice(
  client: OpenAI, model: string, systemPrompt: string, userPrompt: string, termIds: string[],
  onUsage?: (usage: OpenAI.Completions.CompletionUsage | undefined) => void,
) {
  return generateValidBatch(async (repair) => {
    const completion = await client.chat.completions.create({
      model,
      ...(model === 'gpt-6-luna' ? { reasoning_effort: 'none' as const } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: repair ? `${userPrompt}\n\nThe previous response was invalid. Return a complete corrected batch, following all option, language and format requirements.` : userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    onUsage?.(completion.usage);
    return completion.choices[0]?.message?.content || null;
  }, termIds);
}
