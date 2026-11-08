// File-system adapters: read business data, write results.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { isAngle } from '../domain/angles.ts';
import type { Brand, LibraryRow } from '../domain/types.ts';

export function loadBrand(path: string): Brand {
  return JSON.parse(readFileSync(path, 'utf8')) as Brand;
}

const NUMERIC = ['spend_usd', 'romi_pct', 'hook_rate_pct', 'ctr_pct'] as const;

/** Parses winners.csv and fails loudly on bad rows: a silent typo would skew the examples. */
export function parseLibraryCsv(csv: string): LibraryRow[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((r, i) => {
    const line = i + 2; // +1 for the header, +1 for 1-based lines
    if (!isAngle(r.angle)) throw new Error(`winners.csv line ${line}: unknown angle "${r.angle}"`);
    const row = { ...r } as unknown as LibraryRow;
    for (const key of NUMERIC) {
      const value = Number(r[key]);
      if (r[key] === '' || Number.isNaN(value)) throw new Error(`winners.csv line ${line}: ${key} is not a number`);
      row[key] = value;
    }
    return row;
  });
}

export function loadLibrary(path: string): LibraryRow[] {
  return parseLibraryCsv(readFileSync(path, 'utf8'));
}

/** Writes a file into `dir` (created if missing) and returns its path. */
export function writeOutput(dir: string, name: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

export interface SampleScript {
  name: string;
  script: string;
}

/** Sample winning scripts for the UI's "load example" buttons. */
export function loadSampleScripts(dir: string): SampleScript[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => ({ name: basename(f, '.txt'), script: readFileSync(join(dir, f), 'utf8') }));
}
