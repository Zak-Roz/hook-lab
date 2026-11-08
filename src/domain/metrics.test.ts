import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMetrics, median } from './metrics.ts';
import type { GeneratedEvent, SessionEvent } from './metrics.ts';

const gen = (id: string, at: string, over: Partial<GeneratedEvent> = {}): GeneratedEvent => ({
  type: 'generated', session_id: id, at, script_title: 'T', model: 'claude-sonnet-5-5', mock: false,
  variants: [
    { id: 'M1', angle: 'demo', status: 'ok' },
    { id: 'M2', angle: 'pain', status: 'ok' },
    { id: 'M3', angle: 'pain', status: 'warn' },
    { id: 'M4', angle: 'demo', status: 'error' },
  ],
  first_pass: { ok: 1, warn: 1, error: 2 },
  repair: { attempted: 2, fixed: 1 },
  input_tokens: 1000, output_tokens: 2000, cost_usd: 0.04, duration_ms: 20000,
  ...over,
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
  });
});

describe('computeMetrics', () => {
  const events: SessionEvent[] = [
    gen('s1', '2026-11-08T10:00:00Z'),
    { type: 'exported', session_id: 's1', at: '2026-11-08T10:02:00Z', selected: [
      { id: 'M1', angle: 'demo', edited: false },
      { id: 'M2', angle: 'pain', edited: true },
    ] },
    gen('s2', '2026-11-08T11:00:00Z'), // generated, never exported
    gen('mock', '2026-11-08T12:00:00Z', { mock: true }),
  ];

  it('counts sessions and validity before and after repair, ignoring mock runs', () => {
    const m = computeMetrics(events);
    assert.equal(m.sessions, 2);
    assert.equal(m.exportedSessions, 1);
    assert.equal(m.variants, 8);
    assert.equal(m.firstPassValidRate, 4 / 8);
    assert.equal(m.validRate, 6 / 8);
    assert.deepEqual([m.repairAttempted, m.repairFixed], [4, 2]);
  });

  it('measures acceptance, edits and time to export on exported sessions only', () => {
    const m = computeMetrics(events);
    assert.equal(m.acceptanceRate, 2 / 4);
    assert.equal(m.editRate, 1 / 2);
    assert.equal(m.medianSecondsToExport, 120);
    assert.equal(m.avgCostUsd, 0.04);
  });

  it('breaks acceptance down by angle', () => {
    const m = computeMetrics(events);
    assert.deepEqual(m.byAngle.map((a) => [a.angle, a.taken, a.shown]), [['demo', 1, 2], ['pain', 1, 2]]);
  });

  it('can include mock runs for demos', () => {
    assert.equal(computeMetrics(events, { includeMock: true }).sessions, 3);
  });
});
