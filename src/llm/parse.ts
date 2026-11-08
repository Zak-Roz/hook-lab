// Turns the model's JSON text into domain objects, tolerating small format drift.
import { isAngle } from '../domain/angles.ts';
import type { Angle } from '../domain/angles.ts';
import type { Original, Variant } from '../domain/types.ts';

export interface ModelOutput {
  original: Original;
  variants: Variant[];
}

/**
 * Structured output guarantees the JSON shape, but we still check it:
 * the mock response and future models go through the same path.
 */
export function parseModelOutput(text: string, plan: Angle[] = []): ModelOutput {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Model output is not valid JSON');
  }
  const obj = data as { original?: Record<string, unknown>; variants?: unknown[] };
  if (!obj?.original || !Array.isArray(obj.variants)) {
    throw new Error('Model output is missing "original" or "variants"');
  }

  const original: Original = {
    hook: str(obj.original.hook),
    first_line: str(obj.original.first_line),
    on_screen_text: str(obj.original.on_screen_text),
    core_promise: str(obj.original.core_promise),
  };
  return { original, variants: parseVariants(obj.variants, plan) };
}

/** Repair call output: `{ variants: [...] }`. */
export function parseRepairOutput(text: string, plan: Angle[] = []): Variant[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Repair output is not valid JSON');
  }
  const obj = data as { variants?: unknown[] };
  if (!Array.isArray(obj?.variants)) throw new Error('Repair output is missing "variants"');
  return parseVariants(obj.variants, plan);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseVariants(list: unknown[], plan: Angle[]): Variant[] {
  return list.map((raw, i) => {
    const v = (raw ?? {}) as Record<string, unknown>;
    // Structured output may change an enum's letter case, so normalise it.
    const angle = str(v.angle).toLowerCase().replace(/\s+/g, '_');
    return {
      angle: isAngle(angle) ? angle : (plan[i] ?? 'pain'),
      hook: str(v.hook),
      first_line: str(v.first_line),
      on_screen_text: str(v.on_screen_text),
      visual_idea: str(v.visual_idea),
      rationale: str(v.rationale),
    };
  });
}
