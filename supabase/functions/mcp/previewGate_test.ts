import { isLocalPreviewEnabled } from './previewGate.ts';
Deno.test('Supabase OAuth prototype is enabled only by explicit local opt-in', () => {
  const deny: [string | undefined, string | undefined][] = [
    [undefined, 'http://kong:8000'], ['false', 'http://kong:8000'],
    ['true', undefined], ['true', 'invalid'], ['true', 'https://project.supabase.co'],
    ['true', 'https://localhost'], ['true', 'http://localhost.attacker.example'],
  ];
  for (const args of deny) if (isLocalPreviewEnabled(...args)) throw new Error(`Unexpectedly enabled: ${args}`);
  if (!isLocalPreviewEnabled('true', 'http://kong:8000')) throw new Error('Local Docker preview denied');
  if (!isLocalPreviewEnabled('true', 'http://127.0.0.1:55421')) throw new Error('Local preview denied');
});
