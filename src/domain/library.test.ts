import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { angleStats, pickExamples, topics } from './library.ts';
import type { LibraryRow } from './types.ts';

const row = (over: Partial<LibraryRow>): LibraryRow => ({
  ad_id: 'W-1', launched: '2026-10', topic: 'laundry-loss', angle: 'pain',
  hook: 'h', first_line: 'f', on_screen_text: 'o',
  spend_usd: 10000, romi_pct: 140, hook_rate_pct: 30, ctr_pct: 1.2,
  ...over,
});

describe('angleStats', () => {
  it('weights ROMI by spend and sorts best first', () => {
    const stats = angleStats([
      row({ angle: 'pain', spend_usd: 30000, romi_pct: 160 }),
      row({ angle: 'pain', spend_usd: 10000, romi_pct: 100 }),
      row({ angle: 'demo', spend_usd: 5000, romi_pct: 150 }),
    ]);
    assert.deepEqual(stats.map((s) => [s.angle, s.romi_pct]), [['demo', 150], ['pain', 145]]);
  });
});

describe('pickExamples', () => {
  const rows = [
    row({ ad_id: 'small-test', spend_usd: 1000, romi_pct: 200 }),
    row({ ad_id: 'loser', romi_pct: 110 }),
    row({ ad_id: 'pain-1', angle: 'pain', romi_pct: 170 }),
    row({ ad_id: 'pain-2', angle: 'pain', romi_pct: 165 }),
    row({ ad_id: 'pain-3', angle: 'pain', romi_pct: 160 }),
    row({ ad_id: 'demo-other-topic', angle: 'demo', topic: 'gift', romi_pct: 180 }),
  ];

  it('skips small tests and losers, caps each angle', () => {
    const ids = pickExamples(rows, { maxPerAngle: 2 }).map((r) => r.ad_id);
    assert.deepEqual(ids, ['demo-other-topic', 'pain-1', 'pain-2']);
  });

  it('puts the requested topic first', () => {
    const ids = pickExamples(rows, { topic: 'laundry-loss', k: 2 }).map((r) => r.ad_id);
    assert.deepEqual(ids, ['pain-1', 'pain-2']);
  });
});

describe('topics', () => {
  it('returns unique sorted topics', () => {
    assert.deepEqual(topics([row({ topic: 'gift' }), row({ topic: 'folding' }), row({ topic: 'gift' })]), ['folding', 'gift']);
  });
});
