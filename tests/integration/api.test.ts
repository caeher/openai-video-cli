import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import sharp from 'sharp';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { OpenAIAssets, ApiOperations } from '../../src/api/index.js';
import { ModelRegistry } from '../../src/registry/index.js';
import { CostLedger } from '../../src/cost/index.js';
import { signal, temporary } from '../helpers.js';

describe('official SDK adapters with intercepted transport', () => {
  it('sends only documented image parameters and verifies binary output', async () => {
    const root = await temporary();
    const image = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#005566' },
    })
      .png()
      .toBuffer();
    let calls = 0;
    const client = new OpenAI({
      apiKey: 'test-only',
      maxRetries: 0,
      fetch: async (url, init) => {
        calls++;
        expect(String(url)).toBe('https://api.openai.com/v1/images/generations');
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'gpt-image-2.5-sunburst',
          prompt: 'A forest',
          size: '1024x1024',
          quality: 'medium',
          n: 1,
          output_format: 'png',
        });
        return Response.json({
          created: 0,
          data: [{ b64_json: image.toString('base64') }],
          usage: {
            input_tokens: 10,
            input_tokens_details: { text_tokens: 10, image_tokens: 0 },
            output_tokens: 196,
          },
        });
      },
    });
    const ledger = new CostLedger(root);
    const assets = new OpenAIAssets(client, new ModelRegistry(), new ApiOperations(root, ledger));
    const request = {
      model: 'gpt-image-2.5-sunburst' as const,
      prompt: 'A forest',
      output: join(root, 'forest.png'),
    };
    const result = await assets.image(request, signal());
    expect((await stat(result.output)).size).toBe(image.length);
    expect(result.mode).toBe('openai');
    expect((await ledger.report()).unknownCharges).toBe(0);
    expect(await assets.image(request, signal())).toEqual(result);
    expect(calls).toBe(1);
  });
  it('optimizes using Responses API and reuses completed requests after restart', async () => {
    const root = await temporary();
    let calls = 0;
    const client = new OpenAI({
      apiKey: 'test-only',
      maxRetries: 0,
      fetch: async (url, init) => {
        calls++;
        expect(String(url)).toContain('/v1/responses');
        const body = JSON.parse(String(init?.body));
        expect(body.store).toBe(false);
        expect(body.max_output_tokens).toBe(512);
        return Response.json({
          id: 'resp_test',
          object: 'response',
          status: 'completed',
          model: 'gpt-6-luna',
          output: [
            {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                { type: 'output_text', text: 'A cinematic forest scene.', annotations: [] },
              ],
            },
          ],
          usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
        });
      },
    });
    const ledger = new CostLedger(root);
    const first = new OpenAIAssets(client, new ModelRegistry(), new ApiOperations(root, ledger));
    const result = await first.optimize('A forest', 'gpt-6-luna', 512, signal());
    const second = new OpenAIAssets(client, new ModelRegistry(), new ApiOperations(root, ledger));
    expect(await second.optimize('A forest', 'gpt-6-luna', 512, signal())).toEqual(result);
    expect(calls).toBe(1);
    expect((await ledger.report()).charges).toHaveLength(1);
  });
  it('does not retry paid creates after transport failure', async () => {
    const root = await temporary();
    let calls = 0;
    const client = new OpenAI({
      apiKey: 'test-only',
      maxRetries: 0,
      fetch: async () => {
        calls++;
        throw new Error('connection lost');
      },
    });
    const assets = new OpenAIAssets(
      client,
      new ModelRegistry(),
      new ApiOperations(root, new CostLedger(root)),
    );
    await expect(assets.optimize('A forest', 'gpt-6-luna', 512, signal())).rejects.toMatchObject({
      code: 'SUBMISSION_UNCERTAIN',
    });
    await expect(assets.optimize('A forest', 'gpt-6-luna', 512, signal())).rejects.toMatchObject({
      code: 'SUBMISSION_UNCERTAIN',
    });
    expect(calls).toBe(1);
  });
});
