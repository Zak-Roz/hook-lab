// Use case: run every sample script with every prompt style and collect the numbers.
import type { EvalRun } from '../domain/eval-report.ts';
import { FIELD_LABEL } from '../domain/validation.ts';
import type { SampleScript } from '../infra/files.ts';
import type { WordLimitStyle } from '../llm/prompt.ts';
import { generateVariations } from './generate-variations.ts';
import type { GenerateDeps } from './generate-variations.ts';

export interface EvalOptions {
  scripts: SampleScript[];
  styles: WordLimitStyle[];
  /** Repeats per script and style: model output varies run to run. */
  repeats: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runEval(deps: GenerateDeps, options: EvalOptions): Promise<EvalRun[]> {
  const jobs = options.styles.flatMap((style) =>
    options.scripts.flatMap((s) => Array.from({ length: options.repeats }, () => ({ style, s }))),
  );
  let done = 0;

  // All runs in parallel: ~6 requests is far below API rate limits and keeps the eval to about a minute.
  return Promise.all(
    jobs.map(async ({ style, s }): Promise<EvalRun> => {
      const base = { style, script: s.name };
      try {
        const r = await generateVariations({ script: s.script, wordLimitStyle: style }, deps);
        return {
          ...base,
          variants: r.variants.map((v) => ({
            id: v.id, angle: v.angle, hook: v.hook, on_screen_text: v.on_screen_text,
            status: v.status, fixed: Boolean(v.fixed),
            issues: v.issues.map((i) => `${FIELD_LABEL[i.field]}: ${i.message}`),
          })),
          firstPass: r.firstPass,
          repair: r.repair,
          durationMs: r.durationMs,
          costUsd: r.usage.cost_usd,
        };
      } catch (error) {
        return {
          ...base, variants: [], firstPass: { ok: 0, warn: 0, error: 0 }, repair: { attempted: 0, fixed: 0 },
          durationMs: 0, costUsd: null, error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        options.onProgress?.(++done, jobs.length);
      }
    }),
  );
}
