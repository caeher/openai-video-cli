import { describe, it, expect } from 'vitest';
import { buildPrompt, templates, promptFields, validatePrompt } from '../../src/prompt/index.js';
import { authorizeCost, estimateCost } from '../../src/cost/index.js';
import { validateStoryboard, schedule } from '../../src/storyboard/index.js';
import { signal } from '../helpers.js';

describe('prompt engine', () => {
  it('renders every field as natural language and validates unknown keys', () => {
    const spec = Object.fromEntries(promptFields.map((key) => [key, `Example ${key}`]));
    const result = buildPrompt(spec);
    expect(result.text).toContain('Camera movement: Example cameraMovement.');
    expect(result.text).toContain('Shot transitions:');
    expect(result.syntax).toBe('natural_language');
    expect(() => buildPrompt({ subject: 'A tree', invented_parameter: true })).toThrow();
  });
  it('provides all requested templates and useful composition warnings', () => {
    expect(Object.keys(templates)).toHaveLength(13);
    expect(
      validatePrompt({ subject: 'A speaker', dialogue: 'Hello' }).warnings.join(' '),
    ).toContain('audio context');
    expect(() => buildPrompt({ lighting: 'Warm' })).toThrow();
  });
});
describe('cost protection', () => {
  it('never uses historical video pricing', () => {
    const result = estimateCost({ model: 'sora-2', seconds: 12, quantity: 3 });
    expect(result.amount).toBeNull();
    expect(result.upperBound).toBeNull();
  });
  it('estimates local cost and scales a text bound by quantities and regenerations', () => {
    expect(estimateCost({ model: 'x', mode: 'local' }).amount).toBe(0);
    const one = estimateCost({ model: 'gpt-6-luna', prompt: 'A forest' });
    const many = estimateCost({
      model: 'gpt-6-luna',
      prompt: 'A forest',
      quantity: 2,
      regenerations: 1,
    });
    expect(many.upperBound).toBe(one.upperBound! * 4);
  });
  it('requires explicit unknown-cost approval and rejects unenforceable budgets', async () => {
    const estimate = estimateCost({ model: 'gpt-image-2.5-sunburst' });
    await expect(authorizeCost(estimate, { nonInteractive: true })).rejects.toMatchObject({
      code: 'COST_UNKNOWN',
    });
    await expect(
      authorizeCost(estimate, { allowUnknownCost: true, nonInteractive: true }),
    ).rejects.toMatchObject({ code: 'COST_CONFIRMATION_REQUIRED' });
    await expect(
      authorizeCost(estimate, { maxCost: 3, allowUnknownCost: true, confirmCost: true }),
    ).rejects.toMatchObject({ code: 'COST_LIMIT_UNVERIFIABLE' });
    await expect(
      authorizeCost(estimate, { allowUnknownCost: true, confirmCost: true }),
    ).resolves.toBeUndefined();
  });
  it('rejects bounds above a budget', async () => {
    const estimate = estimateCost({ model: 'gpt-6-luna', prompt: 'test' });
    await expect(authorizeCost(estimate, { maxCost: 0 })).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
  });
});
describe('storyboard dependency scheduling', () => {
  const scenes = [
    { id: 'a', order: 0, description: 'A', prompt: 'Scene A', output: 'a.mp4', dependsOn: ['b'] },
    { id: 'b', order: 1, description: 'B', prompt: 'Scene B', output: 'b.mp4', dependsOn: ['a'] },
  ];
  it('rejects cycles, missing dependencies and duplicate outputs', () => {
    expect(() => validateStoryboard({ name: 'Test', scenes })).toThrow('cycle');
    expect(() =>
      validateStoryboard({ name: 'Test', scenes: [{ ...scenes[0], dependsOn: ['missing'] }] }),
    ).toThrow('Unknown dependency');
    expect(() =>
      validateStoryboard({
        name: 'Test',
        scenes: scenes.map((s) => ({ ...s, dependsOn: [], output: 'same.mp4' })),
      }),
    ).toThrow('share output');
  });
  it('respects dependencies and continues independent work after failure', async () => {
    const order: string[] = [];
    const results = await schedule(
      [
        { id: 'a', dependsOn: [], value: 'a' },
        { id: 'b', dependsOn: ['a'], value: 'b' },
        { id: 'c', dependsOn: [], value: 'c' },
      ],
      2,
      async (value) => {
        order.push(value);
        if (value === 'a') throw new Error('failed');
        return value;
      },
      signal(),
    );
    expect(results.b?.state).toBe('blocked');
    expect(results.c?.state).toBe('completed');
    expect(order).not.toContain('b');
  });
});
