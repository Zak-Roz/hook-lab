// Append-only JSONL log of designer sessions: the raw data for pilot metrics.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionEvent } from '../domain/metrics.ts';

const FILE = 'sessions.jsonl';

export function appendEvent(dir: string, event: SessionEvent): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, FILE), `${JSON.stringify(event)}\n`);
}

export function readEvents(dir: string): SessionEvent[] {
  const path = join(dir, FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SessionEvent];
      } catch {
        return []; // a half-written line must not break the stats
      }
    });
}
