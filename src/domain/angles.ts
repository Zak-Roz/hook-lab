// Hook angles: the "idea type" of an opening. Shared by the prompt, validation and the UI.
import type { AngleStat } from './types.ts';

export const ANGLES = [
  'pain',
  'curiosity',
  'contrarian',
  'social_proof',
  'demo',
  'question',
  'number',
  'pov_story',
] as const;

export type Angle = (typeof ANGLES)[number];

export function isAngle(value: string): value is Angle {
  return (ANGLES as readonly string[]).includes(value);
}

export const ANGLE_GUIDE: Record<Angle, string> = {
  pain: 'name the everyday frustration the viewer already feels',
  curiosity: 'open a loop the viewer wants closed; withhold the answer for a second',
  contrarian: 'challenge a common belief about the problem',
  social_proof: 'a reaction from a real-sounding person (partner, kid, friend); never invent numbers, ratings or reviews',
  demo: 'tell the viewer to watch something happen on screen',
  question: 'ask a question the viewer answers "yes" to in their head',
  number: "lead with a concrete, relatable count from the person's own life or the offer; no made-up statistics",
  pov_story: 'a "POV:" or first-person mini story that drops the viewer into a moment',
};

/**
 * Which angle goes into which slot. Angles are ordered by library ROMI
 * (best first) and repeated round-robin until `count` slots are filled.
 */
export function planAngles(requested: Angle[], count: number, stats: AngleStat[]): Angle[] {
  const pool = requested.length ? requested : [...ANGLES];
  const rank = (a: Angle) => {
    const i = stats.findIndex((s) => s.angle === a);
    return i === -1 ? stats.length : i;
  };
  const ordered = [...new Set(pool)].sort((a, b) => rank(a) - rank(b));
  return Array.from({ length: count }, (_, i) => ordered[i % ordered.length]);
}
