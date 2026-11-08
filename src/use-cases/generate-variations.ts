// Use case: winning script in, checked variants out.
//   1. ask the model for variants      2. validate them
//   3. send the broken ones back once  4. validate again
import { planAngles } from '../domain/angles.ts';
import type { Angle } from '../domain/angles.ts';
import { angleStats, pickExamples } from '../domain/library.ts';
import type { Brand, LibraryRow, Original } from '../domain/types.ts';
import { countStatuses, validateAll } from '../domain/validation.ts';
import type { CheckedVariant, Issue, StatusCounts } from '../domain/validation.ts';
import type { HookWriter, Usage } from '../llm/hook-writer.ts';
import { parseModelOutput, parseRepairOutput } from '../llm/parse.ts';
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from '../llm/prompt.ts';
import type { WordLimitStyle } from '../llm/prompt.ts';
import { GENERATE_SCHEMA, REPAIR_SCHEMA } from '../llm/schema.ts';

export interface GenerateRequest {
  script: string;
  count?: number;
  angles?: Angle[];
  topic?: string;
  /** Send variants with errors back to the model once (default true). */
  repair?: boolean;
  /** Prompt version for word limits; see llm/prompt.ts. */
  wordLimitStyle?: WordLimitStyle;
}

export interface GenerateDeps {
  brand: Brand;
  library: LibraryRow[];
  writer: HookWriter;
}

export interface GeneratedVariant extends CheckedVariant {
  /** Errors the automatic repair fixed, if it touched this variant. */
  fixed?: Issue[];
}

export interface RepairReport {
  attempted: number;
  fixed: number;
  /** Set when the repair call failed; the first-pass variants are kept. */
  error?: string;
}

export interface GenerationResult {
  original: Original;
  variants: GeneratedVariant[];
  /** Angle requested for each slot, in order. */
  anglePlan: Angle[];
  /** Statuses before the repair round: how good the model is on its own. */
  firstPass: StatusCounts;
  repair: RepairReport;
  model: string;
  mock: boolean;
  usage: Usage;
  durationMs: number;
  /** The model's JSON as received, per step; used to record the mock. */
  raw: { generate: string; repair?: string };
}

export const MIN_COUNT = 1;
export const MAX_COUNT = 20;
export const DEFAULT_COUNT = 10;

/** "Topic: laundry-loss" in the script header, if present. */
export function topicFromScript(script: string): string | undefined {
  return script.match(/^Topic:\s*(.+)$/m)?.[1]?.trim();
}

function addUsage(a: Usage, b: Usage): Usage {
  const cost = a.cost_usd === null || b.cost_usd === null ? null : Number((a.cost_usd + b.cost_usd).toFixed(4));
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens, cost_usd: cost };
}

export async function generateVariations(req: GenerateRequest, deps: GenerateDeps): Promise<GenerationResult> {
  if (!req.script?.trim()) throw new Error('Script is empty');
  const { brand, library, writer } = deps;
  const count = Math.min(Math.max(Math.round(req.count ?? DEFAULT_COUNT), MIN_COUNT), MAX_COUNT);

  const stats = angleStats(library);
  const plan = planAngles(req.angles ?? [], count, stats);
  const examples = pickExamples(library, { topic: req.topic ?? topicFromScript(req.script) });
  const system = buildSystemPrompt(brand, req.wordLimitStyle);
  // A recorded mock answer was made for one plan, so don't flag angle mismatches against a new one.
  const checkPlan = writer.isMock ? [] : plan;
  const started = Date.now();

  // 1–2. Generate and check.
  const first = await writer.write({
    kind: 'generate',
    system,
    user: buildUserPrompt({ script: req.script, plan, examples, stats }),
    schema: GENERATE_SCHEMA,
  });
  const { original, variants } = parseModelOutput(first.text, plan);
  let checked: GeneratedVariant[] = validateAll(variants.slice(0, count), original, brand, checkPlan);
  const firstPass = countStatuses(checked);
  let usage = first.usage;
  const raw: GenerationResult['raw'] = { generate: first.text };

  // 3–4. One repair round for variants with errors. Warnings stay for a human to judge.
  const failedIdx = checked.flatMap((v, i) => (v.status === 'error' ? [i] : []));
  const repair: RepairReport = { attempted: 0, fixed: 0 };

  if (req.repair !== false && failedIdx.length) {
    repair.attempted = failedIdx.length;
    try {
      const second = await writer.write({
        kind: 'repair',
        system,
        user: buildRepairPrompt({
          script: req.script,
          failed: failedIdx.map((i) => checked[i]),
          others: checked.filter((v) => v.status !== 'error'),
        }),
        schema: REPAIR_SCHEMA,
      });
      usage = addUsage(usage, second.usage);
      raw.repair = second.text;

      const rewritten = parseRepairOutput(second.text, failedIdx.map((i) => plan[i]));
      const merged = checked.map((v, i) => {
        const k = failedIdx.indexOf(i);
        return k !== -1 && rewritten[k] ? rewritten[k] : v;
      });
      const before = checked;
      checked = validateAll(merged, original, brand, checkPlan).map((v, i) => {
        if (!failedIdx.includes(i) || v.status === 'error') return v;
        repair.fixed++;
        return { ...v, fixed: before[i].issues.filter((x) => x.severity === 'error') };
      });
    } catch (error) {
      repair.error = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    original,
    variants: checked,
    anglePlan: plan,
    firstPass,
    repair,
    model: writer.model,
    mock: writer.isMock,
    usage,
    durationMs: Date.now() - started,
    raw,
  };
}
