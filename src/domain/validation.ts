// Deterministic checks, no LLM: they are cheap, predictable and unit-tested.
import type { Angle } from './angles.ts';
import type { Brand, Original, Variant } from './types.ts';

export type Severity = 'error' | 'warn';
export type Field = 'hook' | 'first_line' | 'on_screen_text' | 'visual_idea' | 'angle';

export interface Issue {
  field: Field;
  severity: Severity;
  message: string;
}

export type Status = 'ok' | 'warn' | 'error';

export interface CheckedVariant extends Variant {
  id: string;
  issues: Issue[];
  /** error = do not use as is, warn = check before use, ok = ready. */
  status: Status;
}

export type StatusCounts = Record<Status, number>;

export function countStatuses(variants: { status: Status }[]): StatusCounts {
  const counts: StatusCounts = { ok: 0, warn: 0, error: 0 };
  for (const v of variants) counts[v.status]++;
  return counts;
}

const COPY_FIELDS = ['hook', 'first_line', 'on_screen_text'] as const;

const STOPWORDS = new Set(
  ('a an the and or but to of in on at for with from by is are was were be been it its this that these those ' +
    'i me my we our you your he him his she her they them their so just not no do does did im youre').split(' '),
);

/** Words a viewer would read or hear; arrows and dashes don't count. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Content words for similarity: lowercase, no punctuation, no stopwords. */
export function contentTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOPWORDS.has(w));
  return new Set(words);
}

/** Share of words two lines have in common: 0 = nothing, 1 = same words. */
export function jaccard(a: string, b: string): number {
  const x = contentTokens(a);
  const y = contentTokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word match for words ("free" but not "carefree"); plain match for symbols like "100%". */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = escapeRegex(phrase.toLowerCase());
  const wordLike = /^[\p{L}\p{N}]/u.test(phrase) && /[\p{L}\p{N}]$/u.test(phrase);
  const re = wordLike ? new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, 'u') : new RegExp(p, 'u');
  return re.test(text.toLowerCase());
}

/** 0–9 with no % or decimals: "3 places", "1 missing sock". */
function isSmallCount(num: string): boolean {
  return /^\d$/.test(num);
}

export const FIELD_LABEL: Record<Field, string> = {
  hook: 'Hook',
  first_line: 'First line',
  on_screen_text: 'On-screen text',
  visual_idea: 'Visual idea',
  angle: 'Angle',
};

export function checkVariant(v: Variant, brand: Brand, original: Original, expectedAngle?: Angle): Issue[] {
  const issues: Issue[] = [];
  const add = (field: Field, severity: Severity, message: string) => issues.push({ field, severity, message });

  // 1. Nothing empty.
  for (const field of [...COPY_FIELDS, 'visual_idea'] as const) {
    if (!v[field].trim()) add(field, 'error', `${FIELD_LABEL[field]} is empty`);
  }

  // 2. Length limits: a hook has ~3 seconds, on-screen text must be read at a glance.
  const limits: Record<(typeof COPY_FIELDS)[number], number> = {
    hook: brand.limits.hookMaxWords,
    first_line: brand.limits.firstLineMaxWords,
    on_screen_text: brand.limits.onScreenMaxWords,
  };
  for (const field of COPY_FIELDS) {
    const n = wordCount(v[field]);
    if (n > limits[field]) add(field, 'error', `${FIELD_LABEL[field]} is ${n} words, limit ${limits[field]}`);
  }

  for (const field of COPY_FIELDS) {
    const text = v[field];

    // 3. Claims we are not allowed to make.
    for (const banned of brand.bannedPhrases) {
      if (containsPhrase(text, banned.pattern)) add(field, 'error', `"${banned.pattern}": ${banned.reason}`);
    }

    // 4. Prices must match the offer.
    for (const price of text.match(/\$\s?\d+(?:[.,]\d+)?/g) ?? []) {
      const normalised = price.replace(/\s/g, '');
      if (!brand.allowedPrices.includes(normalised)) add(field, 'error', `Price ${normalised} is not the real offer`);
    }

    // 5. Numbers that look like statistics (percentages, decimals, 10+) may be invented:
    //    flag them for a human check. Small counts ("3 places") are everyday storytelling.
    const withoutPrices = text.replace(/\$\s?\d+(?:[.,]\d+)?/g, ' ');
    for (const num of withoutPrices.match(/\d+(?:[.,]\d+)?%?/g) ?? []) {
      if (brand.allowedNumbers.includes(num) || isSmallCount(num)) continue;
      add(field, 'warn', `Number "${num}" is not in the product facts — check it isn't a made-up stat`);
    }
  }

  // 6. Did the model follow the angle plan?
  if (expectedAngle && v.angle !== expectedAngle) {
    add('angle', 'warn', `Asked for "${expectedAngle}", got "${v.angle}"`);
  }

  // 7. A variant that repeats the winner teaches us nothing new.
  const sim = jaccard(v.hook, original.hook);
  if (original.hook && sim >= brand.similarityThreshold) {
    add('hook', 'error', `Too close to the original hook (similarity ${sim.toFixed(2)})`);
  }

  return issues;
}

function statusOf(issues: Issue[]): CheckedVariant['status'] {
  if (issues.some((i) => i.severity === 'error')) return 'error';
  if (issues.length) return 'warn';
  return 'ok';
}

export function validateAll(variants: Variant[], original: Original, brand: Brand, plan: Angle[] = []): CheckedVariant[] {
  const checked = variants.map((v, i) => ({ ...v, id: `M${i + 1}`, issues: checkVariant(v, brand, original, plan[i]) }));

  // 8. Near-duplicates inside the batch: the later one gets the error.
  for (let j = 0; j < checked.length; j++) {
    for (let i = 0; i < j; i++) {
      const sim = jaccard(checked[i].hook, checked[j].hook);
      if (sim >= brand.similarityThreshold) {
        checked[j].issues.push({ field: 'hook', severity: 'error', message: `Near-duplicate of ${checked[i].id} (similarity ${sim.toFixed(2)})` });
        break;
      }
    }
  }

  return checked.map((v) => ({ ...v, status: statusOf(v.issues) }));
}
