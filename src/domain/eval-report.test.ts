import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evalMarkdown, summarizeEval } from './eval-report.ts';
import type { EvalRun } from './eval-report.ts';

const run = (style: string, over: Partial<EvalRun> = {}): EvalRun => ({
  style,
  script: 'winner-1',
  variants: [
    { id: 'M1', angle: 'demo', hook: 'Watch | this', on_screen_text: 'Snap', status: 'ok', fixed: false, issues: [] },
    { id: 'M2', angle: 'pain', hook: 'Too long', on_screen_text: 'x', status: 'error', fixed: false, issues: ['Hook is 14 words'] },
  ],
  firstPass: { ok: 0, warn: 0, error: 2 },
  repair: { attempted: 2, fixed: 1 },
  durationMs: 20000,
  costUsd: 0.04,
  ...over,
});

describe('summarizeEval', () => {
  it('compares styles on validity before and after repair, time and cost', () => {
    const [count, margin] = summarizeEval([run('count'), run('margin', { durationMs: 10000, costUsd: 0.02 }), run('margin', { error: 'API down' })]);
    assert.equal(count.firstPassValidRate, 0);
    assert.equal(count.finalValidRate, 0.5);
    assert.deepEqual([margin.runs, margin.failedRuns, margin.avgDurationSec, margin.avgCostUsd], [2, 1, 10, 0.02]);
  });
});

describe('evalMarkdown', () => {
  it('has a summary row per style and an escaped table per run', () => {
    const md = evalMarkdown([run('count')], { date: new Date('2026-11-08T12:00:00Z'), model: 'm' });
    assert.match(md, /\| count \| 1\/1 \| 2 \| 0% \| 50% \| 1\/2 \| 20\.0 \| 0\.040 \|/);
    assert.match(md, /Watch \\\| this/);
    assert.match(md, /error: Hook is 14 words \|  \|/);
  });
});
