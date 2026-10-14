import { describe, it, expect } from 'vitest';
import { openAIClient } from '../../src/api/index.js';
describe.runIf(process.env.OAIVIDEO_REAL_API === '1')(
  'explicit real API checks (read-only)',
  () => {
    it('authenticates and retrieves real model IDs without generating assets', async () => {
      const page = await openAIClient().models.list();
      expect(page.data.length).toBeGreaterThan(0);
    });
  },
);
