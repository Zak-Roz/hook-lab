// Prompt evaluation: compare prompt versions on the same scripts. Pure: runs in, summary and report out.
import type { Angle } from './angles.ts';
import type { Status, StatusCounts } from './validation.ts';

export interface EvalRun {
  style: string;
  script: string;
  variants: { id: string; angle: Angle; hook: string; on_screen_text: string; status: Status; fixed: boolean; issues: string[] }[];
  firstPass: StatusCounts;
  repair: { attempted: number; fixed: number; error?: string };
  durationMs: number;
  costUsd: number | null;
  /** The run itself failed (API error). */
  error?: string;
}

export interface EvalSummary {
  style: string;
  runs: number;
  failedRuns: number;
  variants: number;
  /** No errors straight from the model. */
  firstPassValidRate: number | null;
  /** No errors after the repair round: what designers get. */
  finalValidRate: number | null;
  repairAttempted: number;
  repairFixed: number;
  avgDurationSec: number | null;
  avgCostUsd: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizeEval(runs: EvalRun[]): EvalSummary[] {
  const styles = [...new Set(runs.map((r) => r.style))];
  return styles.map((style) => {
    const all = runs.filter((r) => r.style === style);
    const ok = all.filter((r) => !r.error);
    const variants = ok.reduce((n, r) => n + r.variants.length, 0);
    const firstValid = ok.reduce((n, r) => n + r.firstPass.ok + r.firstPass.warn, 0);
    const finalValid = ok.reduce((n, r) => n + r.variants.filter((v) => v.status !== 'error').length, 0);
    const costs = ok.map((r) => r.costUsd).filter((c): c is number => c !== null);
    return {
      style,
      runs: all.length,
      failedRuns: all.length - ok.length,
      variants,
      firstPassValidRate: variants ? firstValid / variants : null,
      finalValidRate: variants ? finalValid / variants : null,
      repairAttempted: ok.reduce((n, r) => n + r.repair.attempted, 0),
      repairFixed: ok.reduce((n, r) => n + r.repair.fixed, 0),
      avgDurationSec: avg(ok.map((r) => r.durationMs / 1000)),
      avgCostUsd: avg(costs),
    };
  });
}

export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const num = (x: number | null, digits: number) => (x === null ? '—' : x.toFixed(digits));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function evalMarkdown(runs: EvalRun[], meta: { date: Date; model: string }): string {
  const summary = summarizeEval(runs);
  const lines = [
    `# Prompt eval — ${meta.date.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `Model: ${meta.model}. Each run = one script, default settings (10 variants, all angles).`,
    '',
    '## Summary',
    '',
    '| Prompt style | Runs | Variants | Valid, first pass | Valid, after auto-fix | Auto-fixed | Avg time, s | Avg cost, $ |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summary.map(
      (s) =>
        `| ${s.style} | ${s.runs - s.failedRuns}/${s.runs} | ${s.variants} | ${pct(s.firstPassValidRate)} | ${pct(s.finalValidRate)} | ` +
        `${s.repairFixed}/${s.repairAttempted} | ${num(s.avgDurationSec, 1)} | ${num(s.avgCostUsd, 3)} |`,
    ),
    '',
    '"Valid" = no validation errors (warnings allowed). Fill the **Usable?** column below by hand: would a designer produce this hook as is (y) or not (n)? Target: ≥ 50% usable.',
  ];

  for (const r of runs) {
    lines.push('', `## ${r.style} · ${r.script}`, '');
    if (r.error) {
      lines.push(`Run failed: ${r.error}`);
      continue;
    }
    lines.push(
      `${(r.durationMs / 1000).toFixed(1)} s · $${num(r.costUsd, 3)} · first pass ${r.firstPass.ok} ok / ${r.firstPass.warn} warn / ${r.firstPass.error} error · auto-fixed ${r.repair.fixed}/${r.repair.attempted}`,
      '',
      '| # | Angle | Hook | On-screen | Status | Usable? |',
      '| --- | --- | --- | --- | --- | --- |',
      ...r.variants.map(
        (v) =>
          `| ${v.id} | ${v.angle} | ${cell(v.hook)} | ${cell(v.on_screen_text)} | ${v.status}${v.fixed ? ' (fixed)' : ''}` +
          `${v.issues.length ? `: ${cell(v.issues.join('; '))}` : ''} |  |`,
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}
