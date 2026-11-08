import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAngle, planAngles } from './angles.ts';
import type { AngleStat } from './types.ts';

const stats: AngleStat[] = [
  { angle: 'curiosity', ads: 3, spend_usd: 50000, romi_pct: 160 },
  { angle: 'demo', ads: 3, spend_usd: 50000, romi_pct: 155 },
  { angle: 'pain', ads: 3, spend_usd: 50000, romi_pct: 150 },
];

describe('planAngles', () => {
  it('orders requested angles by library ROMI and repeats them', () => {
    assert.deepEqual(planAngles(['pain', 'curiosity'], 5, stats), ['curiosity', 'pain', 'curiosity', 'pain', 'curiosity']);
  });
  it('uses all angles when none are requested', () => {
    const plan = planAngles([], 8, stats);
    assert.equal(new Set(plan).size, 8);
    assert.deepEqual(plan.slice(0, 3), ['curiosity', 'demo', 'pain']);
  });
});

describe('isAngle', () => {
  it('accepts known angles only', () => {
    assert.equal(isAngle('pov_story'), true);
    assert.equal(isAngle('POV'), false);
  });
});
