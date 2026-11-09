import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadBrand } from '../infra/files.ts';
import { PATHS } from '../infra/paths.ts';
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from './prompt.ts';

describe('prompts', () => {
  const brand = loadBrand(PATHS.brand);

  it('system prompt carries every product fact and the word limits', () => {
    const system = buildSystemPrompt(brand);
    for (const fact of brand.facts) assert.ok(system.includes(fact), fact);
    assert.match(system, new RegExp(`Hard limit ${brand.limits.hookMaxWords} words; aim for ${brand.limits.hookMaxWords - 2}`));
    assert.doesNotMatch(system, /count them/, 'default style is margin');
    assert.match(buildSystemPrompt(brand, 'count'), /count them before answering/);
  });

  it('user prompt lists the script, examples and one slot per planned angle', () => {
    const user = buildUserPrompt({
      script: 'MY SCRIPT',
      plan: ['demo', 'pain', 'demo'],
      examples: [],
      stats: [{ angle: 'demo', ads: 1, spend_usd: 1, romi_pct: 150 }],
    });
    assert.match(user, /<script>\nMY SCRIPT\n<\/script>/);
    assert.match(user, /exactly 3 variants/);
    assert.match(user, /1\. demo\n2\. pain\n3\. demo/);
    assert.match(user, /demo 150%/);
  });

  it('repair prompt carries the script, each problem and the hooks to avoid', () => {
    const base = { angle: 'demo' as const, first_line: 'f', on_screen_text: 'o', visual_idea: 'v', rationale: 'r' };
    const user = buildRepairPrompt({
      script: 'MY SCRIPT',
      failed: [{ ...base, id: 'M2', hook: 'Too long hook', status: 'error', issues: [{ field: 'hook', severity: 'error', message: 'Hook is 14 words, limit 12' }] }],
      others: [{ ...base, id: 'M1', hook: 'Good hook', status: 'ok', issues: [] }],
    });
    assert.match(user, /MY SCRIPT/);
    assert.match(user, /1\. \[demo\] hook: "Too long hook"/);
    assert.match(user, /- Hook is 14 words, limit 12/);
    assert.match(user, /- "Good hook"/);
    assert.match(user, /Return exactly 1 variants/);
  });
});
