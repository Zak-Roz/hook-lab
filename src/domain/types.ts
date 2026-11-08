// Domain types. Pure data: no I/O, no SDKs.
import type { Angle } from './angles.ts';

export interface BannedPhrase {
  pattern: string;
  reason: string;
}

/** data/brand.json: what we may say and how. */
export interface Brand {
  product: string;
  facts: string[];
  audience: string;
  tone: string;
  limits: {
    hookMaxWords: number;
    onScreenMaxWords: number;
    firstLineMaxWords: number;
  };
  allowedNumbers: string[];
  allowedPrices: string[];
  bannedPhrases: BannedPhrase[];
  similarityThreshold: number;
}

/** One row of data/winners.csv: a past ad with its results. */
export interface LibraryRow {
  ad_id: string;
  launched: string;
  topic: string;
  angle: Angle;
  hook: string;
  first_line: string;
  on_screen_text: string;
  spend_usd: number;
  romi_pct: number;
  hook_rate_pct: number;
  ctr_pct: number;
}

export interface AngleStat {
  angle: Angle;
  ads: number;
  spend_usd: number;
  /** Spend-weighted ROMI, so a $40k ad counts more than a $3k test. */
  romi_pct: number;
}

/** The opening of the winning script, as the model read it. */
export interface Original {
  hook: string;
  first_line: string;
  on_screen_text: string;
  core_promise: string;
}

/** One new opening for a modification. */
export interface Variant {
  angle: Angle;
  hook: string;
  first_line: string;
  on_screen_text: string;
  visual_idea: string;
  rationale: string;
}
