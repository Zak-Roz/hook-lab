// Pilot metrics from the session log. Pure: events in, numbers out.
import type { Angle } from './angles.ts';
import type { Status, StatusCounts } from './validation.ts';

export interface GeneratedEvent {
  type: 'generated';
  session_id: string;
  at: string;
  script_title: string;
  model: string;
  mock: boolean;
  variants: { id: string; angle: Angle; status: Status }[];
  first_pass: StatusCounts;
  repair: { attempted: number; fixed: number };
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  duration_ms: number;
}

export interface ExportedEvent {
  type: 'exported';
  session_id: string;
  at: string;
  /** Variants the designer took; `edited` = they changed the text before export. */
  selected: { id: string; angle: Angle; edited: boolean }[];
}

export type SessionEvent = GeneratedEvent | ExportedEvent;

export interface AngleMetrics {
  angle: Angle;
  shown: number;
  taken: number;
  /** taken / shown in exported sessions. */
  takeRate: number | null;
}

export interface Metrics {
  sessions: number;
  exportedSessions: number;
  variants: number;
  /** Share without errors before the repair round. */
  firstPassValidRate: number | null;
  /** Share without errors after repair: what the designer actually gets. */
  validRate: number | null;
  repairAttempted: number;
  repairFixed: number;
  /** Variants taken into the brief / variants shown, in exported sessions. Leading indicator of usefulness. */
  acceptanceRate: number | null;
  /** Taken variants the designer edited first: high = copy is close but not ready. */
  editRate: number | null;
  /** Median seconds from generation to export: time spent picking copy. */
  medianSecondsToExport: number | null;
  avgDurationSec: number | null;
  avgCostUsd: number | null;
  byAngle: AngleMetrics[];
}

const ratio = (a: number, b: number) => (b ? a / b : null);

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeMetrics(events: SessionEvent[], options: { includeMock?: boolean } = {}): Metrics {
  const generated = events.filter((e): e is GeneratedEvent => e.type === 'generated' && (options.includeMock || !e.mock));
  const bySession = new Map(generated.map((g) => [g.session_id, g]));
  // Last export per session wins: a designer may export, tweak and export again.
  const exportsBySession = new Map<string, ExportedEvent>();
  for (const e of events) if (e.type === 'exported' && bySession.has(e.session_id)) exportsBySession.set(e.session_id, e);

  const variants = generated.reduce((n, g) => n + g.variants.length, 0);
  const firstPassValid = generated.reduce((n, g) => n + g.first_pass.ok + g.first_pass.warn, 0);
  const valid = generated.reduce((n, g) => n + g.variants.filter((v) => v.status !== 'error').length, 0);

  let shown = 0;
  let taken = 0;
  let edited = 0;
  const seconds: number[] = [];
  const angles = new Map<Angle, { shown: number; taken: number }>();
  for (const [id, exp] of exportsBySession) {
    const gen = bySession.get(id)!;
    shown += gen.variants.length;
    taken += exp.selected.length;
    edited += exp.selected.filter((s) => s.edited).length;
    seconds.push((Date.parse(exp.at) - Date.parse(gen.at)) / 1000);
    for (const v of gen.variants) {
      const a = angles.get(v.angle) ?? { shown: 0, taken: 0 };
      a.shown++;
      angles.set(v.angle, a);
    }
    for (const s of exp.selected) {
      const a = angles.get(s.angle) ?? { shown: 0, taken: 0 };
      a.taken++;
      angles.set(s.angle, a);
    }
  }

  const costs = generated.map((g) => g.cost_usd).filter((c): c is number => c !== null);
  return {
    sessions: generated.length,
    exportedSessions: exportsBySession.size,
    variants,
    firstPassValidRate: ratio(firstPassValid, variants),
    validRate: ratio(valid, variants),
    repairAttempted: generated.reduce((n, g) => n + g.repair.attempted, 0),
    repairFixed: generated.reduce((n, g) => n + g.repair.fixed, 0),
    acceptanceRate: ratio(taken, shown),
    editRate: ratio(edited, taken),
    medianSecondsToExport: median(seconds),
    avgDurationSec: generated.length ? generated.reduce((n, g) => n + g.duration_ms, 0) / generated.length / 1000 : null,
    avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    byAngle: [...angles]
      .map(([angle, a]) => ({ angle, shown: a.shown, taken: a.taken, takeRate: ratio(a.taken, a.shown) }))
      .sort((a, b) => (b.takeRate ?? 0) - (a.takeRate ?? 0)),
  };
}
