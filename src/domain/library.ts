// What our past ads say: which angles earn the most and which hooks to show the model.
import { ANGLES } from './angles.ts';
import type { Angle } from './angles.ts';
import type { AngleStat, LibraryRow } from './types.ts';

export function topics(rows: LibraryRow[]): string[] {
  return [...new Set(rows.map((r) => r.topic))].sort();
}

/** Spend-weighted ROMI per angle, best first. */
export function angleStats(rows: LibraryRow[]): AngleStat[] {
  const stats = ANGLES.map((angle) => {
    const ofAngle = rows.filter((r) => r.angle === angle);
    const spend = ofAngle.reduce((sum, r) => sum + r.spend_usd, 0);
    const weighted = ofAngle.reduce((sum, r) => sum + r.spend_usd * r.romi_pct, 0);
    return { angle, ads: ofAngle.length, spend_usd: spend, romi_pct: spend ? Math.round(weighted / spend) : 0 };
  });
  return stats.filter((s) => s.ads > 0).sort((a, b) => b.romi_pct - a.romi_pct);
}

export interface PickOptions {
  topic?: string;
  k?: number;
  /** Ignore small tests: their ROMI is noise. */
  minSpend?: number;
  /** Only hooks that beat the business target (ROMI 125%) count as winners. */
  minRomi?: number;
  maxPerAngle?: number;
}

/**
 * Few-shot examples for the prompt: proven winners, same topic first,
 * then best ROMI, at most `maxPerAngle` per angle so the model sees
 * a range of styles instead of six copies of one.
 */
export function pickExamples(rows: LibraryRow[], opts: PickOptions = {}): LibraryRow[] {
  const { topic, k = 6, minSpend = 5000, minRomi = 125, maxPerAngle = 2 } = opts;
  const winners = rows
    .filter((r) => r.spend_usd >= minSpend && r.romi_pct >= minRomi)
    .sort((a, b) => {
      const sameTopic = Number(b.topic === topic) - Number(a.topic === topic);
      return sameTopic || b.romi_pct - a.romi_pct;
    });

  const picked: LibraryRow[] = [];
  const perAngle = new Map<Angle, number>();
  for (const row of winners) {
    if (picked.length >= k) break;
    const used = perAngle.get(row.angle) ?? 0;
    if (used >= maxPerAngle) continue;
    perAngle.set(row.angle, used + 1);
    picked.push(row);
  }
  return picked;
}
