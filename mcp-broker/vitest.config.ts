import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './test/fixtures/wrangler.jsonc' } })],
  test: { include: ['test/workers/*.spec.mjs'] },
});
