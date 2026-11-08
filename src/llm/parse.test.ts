import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseModelOutput } from './parse.ts';

const original = { hook: ' h ', first_line: 'f', on_screen_text: 'o', core_promise: 'p' };
const variant = { angle: 'pain', hook: 'x', first_line: 'y', on_screen_text: 'z', visual_idea: 'v', rationale: 'r' };

describe('parseModelOutput', () => {
  it('reads original and variants and trims text', () => {
    const out = parseModelOutput(JSON.stringify({ original, variants: [variant] }));
    assert.equal(out.original.hook, 'h');
    assert.equal(out.variants[0].angle, 'pain');
  });

  it('normalises angle case and falls back to the plan', () => {
    const out = parseModelOutput(
      JSON.stringify({ original, variants: [{ ...variant, angle: 'Social Proof' }, { ...variant, angle: '???' }] }),
      ['pain', 'demo'],
    );
    assert.deepEqual(out.variants.map((v) => v.angle), ['social_proof', 'demo']);
  });

  it('rejects broken output with a clear message', () => {
    assert.throws(() => parseModelOutput('not json'), /not valid JSON/);
    assert.throws(() => parseModelOutput('{"variants": []}'), /missing "original"/);
  });
});

describe('parseRepairOutput', () => {
  it('reads variants only', async () => {
    const { parseRepairOutput } = await import('./parse.ts');
    const out = parseRepairOutput(JSON.stringify({ variants: [variant] }));
    assert.equal(out.length, 1);
    assert.throws(() => parseRepairOutput('{}'), /missing "variants"/);
  });
});
