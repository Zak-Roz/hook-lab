// Prompt text only. Facts come from data/brand.json, examples from data/winners.csv.
import { ANGLES, ANGLE_GUIDE } from '../domain/angles.ts';
import type { Angle } from '../domain/angles.ts';
import type { AngleStat, Brand, LibraryRow } from '../domain/types.ts';
import type { CheckedVariant } from '../domain/validation.ts';

/**
 * How the prompt states word limits (compared by `npm run eval`):
 * - margin: aim 2 words below the hard limit;
 * - count:  the same, plus "count them before answering".
 * Eval 2026-11-08 (3 scripts × 10 variants each): both 100% valid; margin 31 s / $0.044 vs count 36 s / $0.053.
 * So margin is the default; the repair round is the safety net.
 */
export const WORD_LIMIT_STYLES = ['margin', 'count'] as const;
export type WordLimitStyle = (typeof WORD_LIMIT_STYLES)[number];
export const DEFAULT_WORD_LIMIT_STYLE: WordLimitStyle = 'margin';

/** Models miscount words, so ask for a margin below the hard limit. */
function wordLimit(max: number, style: WordLimitStyle): string {
  const aim = `Hard limit ${max} words; aim for ${Math.max(1, max - 2)} or fewer`;
  return style === 'count' ? `${aim} and count them before answering.` : `${aim}.`;
}

export function buildSystemPrompt(brand: Brand, style: WordLimitStyle = DEFAULT_WORD_LIMIT_STYLE): string {
  const { limits } = brand;
  return `You are a senior direct-response copywriter for ${brand.product}'s performance video ads on Meta (Facebook and Instagram Reels).

Motion designers turn your copy into "modifications" of a proven winning ad: they keep the body and the call to action and replace only the opening. Your job is to write new openings for a winning script.

PRODUCT FACTS (the only claims you may make):
${brand.facts.map((f) => `- ${f}`).join('\n')}

AUDIENCE: ${brand.audience}
TONE: ${brand.tone}

EACH VARIANT HAS:
- hook: the voiceover line in the first ~3 seconds. ${wordLimit(limits.hookMaxWords, style)}
- on_screen_text: the bold caption over the first frames; must work with sound off. ${wordLimit(limits.onScreenMaxWords, style)}
- first_line: the next voiceover line, bridging into the unchanged body. ${wordLimit(limits.firstLineMaxWords, style)}
- visual_idea: what the viewer sees in the first 3 seconds, one sentence, filmable as phone-shot UGC.
- rationale: one short sentence on why this should stop the scroll.

RULES:
1. Keep the core promise of the winning script. The first_line must lead naturally into the body exactly as written.
2. Use only the product facts. Never invent statistics, customer counts, ratings, reviews, discounts, shipping terms, or any price other than $29 for 5 pairs.
3. No absolute or unverifiable claims (guarantee, 100%, forever, best, #1), no health claims, no fake urgency.
4. Do not call out the viewer's personal attributes (e.g. "Are you broke?") — Meta ad policy.
5. Each variant must differ from the original hook and from the other variants in idea, not only in synonyms.
6. Write in plain spoken US English, like a real person filming on their phone.

ANGLES:
${ANGLES.map((a) => `- ${a}: ${ANGLE_GUIDE[a]}`).join('\n')}`;
}

export interface UserPromptInput {
  script: string;
  plan: Angle[];
  examples: LibraryRow[];
  stats: AngleStat[];
}

export function buildUserPrompt({ script, plan, examples, stats }: UserPromptInput): string {
  const exampleLines = examples.map(
    (r) =>
      `- [${r.angle} | ROMI ${r.romi_pct}% | hook rate ${r.hook_rate_pct}%] hook: "${r.hook}" | on-screen: "${r.on_screen_text}"`,
  );
  const statLine = stats.map((s) => `${s.angle} ${s.romi_pct}%`).join(', ');
  const slots = plan.map((angle, i) => `${i + 1}. ${angle}`);

  return `WINNING SCRIPT:
<script>
${script.trim()}
</script>

OUR BEST PAST HOOKS (real results; learn what works, do not copy them):
${exampleLines.join('\n')}

ANGLE PERFORMANCE IN OUR LIBRARY (spend-weighted ROMI): ${statLine}

TASK:
1. Fill "original" with the hook, first line and on-screen text as they appear in the winning script, and its core promise in one sentence.
2. Write exactly ${plan.length} variants, one per slot, using these angles in this order:
${slots.join('\n')}`;
}

export interface RepairPromptInput {
  script: string;
  /** Variants that failed validation, with their issues. */
  failed: CheckedVariant[];
  /** Variants that passed: the rewrite must not repeat them. */
  others: CheckedVariant[];
}

/**
 * Second call: send back only the broken variants with the exact problems.
 * The system prompt (facts, rules, limits) is the same as for the first call.
 */
export function buildRepairPrompt({ script, failed, others }: RepairPromptInput): string {
  const toFix = failed.map((v, i) => {
    const problems = v.issues.filter((x) => x.severity === 'error').map((x) => `   - ${x.message}`);
    return `${i + 1}. [${v.angle}] hook: "${v.hook}" | on-screen: "${v.on_screen_text}" | first line: "${v.first_line}"\n   Problems:\n${problems.join('\n')}`;
  });
  const keep = others.map((v) => `- "${v.hook}"`);

  return `WINNING SCRIPT:
<script>
${script.trim()}
</script>

Some variants for this script failed our checks. Rewrite ONLY these ${failed.length}, in the same order and with the same angle. Fix every listed problem; keep the idea if it survives the fix. If a variant is a duplicate or too close to the original, write a new idea in the same angle.

VARIANTS TO FIX:
${toFix.join('\n')}

OTHER HOOKS IN THIS BATCH (do not repeat them):
${keep.join('\n') || '- none'}

Return exactly ${failed.length} variants.`;
}
