import { fileURLToPath } from 'node:url';

/** Absolute path inside the project, e.g. fromRoot('data/winners.csv'). */
export function fromRoot(relative = ''): string {
  return fileURLToPath(new URL(`../../${relative}`, import.meta.url));
}

export const PATHS = {
  env: fromRoot('.env'),
  brand: fromRoot('data/brand.json'),
  library: fromRoot('data/winners.csv'),
  scripts: fromRoot('data/scripts'),
  /** Recorded real API answers, one file per step: generate.json, repair.json. */
  mock: fromRoot('data/mock'),
  output: fromRoot('out'),
  logs: fromRoot('logs'),
  /** Prompt eval reports: kept in git as evidence of quality. */
  eval: fromRoot('eval'),
  public: fromRoot('public'),
} as const;
