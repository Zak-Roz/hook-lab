// JSON schemas for structured output: the API guarantees the reply matches them.
// They cannot express word limits, so those are checked in domain/validation.ts.
import { ANGLES } from '../domain/angles.ts';

const VARIANT = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'hook', 'first_line', 'on_screen_text', 'visual_idea', 'rationale'],
  properties: {
    angle: { type: 'string', enum: [...ANGLES] },
    hook: { type: 'string' },
    first_line: { type: 'string' },
    on_screen_text: { type: 'string' },
    visual_idea: { type: 'string' },
    rationale: { type: 'string' },
  },
} as const;

/** First call: read the original opening and write new variants. */
export const GENERATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['original', 'variants'],
  properties: {
    original: {
      type: 'object',
      additionalProperties: false,
      required: ['hook', 'first_line', 'on_screen_text', 'core_promise'],
      properties: {
        hook: { type: 'string' },
        first_line: { type: 'string' },
        on_screen_text: { type: 'string' },
        core_promise: { type: 'string' },
      },
    },
    variants: { type: 'array', items: VARIANT },
  },
} as const;

/** Repair call: rewritten variants only. */
export const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: {
    variants: { type: 'array', items: VARIANT },
  },
} as const;
