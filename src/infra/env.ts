import { existsSync } from 'node:fs';
import { PATHS } from './paths.ts';

export interface Settings {
  apiKey: string;
  model?: string;
  /** No key or MOCK=1 means mock mode, so the tool still runs on day one. */
  mock: boolean;
  port: number;
}

export function readSettings(): Settings {
  // Node 22 loads .env natively; no dotenv dependency.
  if (existsSync(PATHS.env)) process.loadEnvFile(PATHS.env);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  return {
    apiKey,
    model: process.env.ANTHROPIC_MODEL?.trim() || undefined,
    mock: process.env.MOCK === '1' || apiKey === '',
    port: Number(process.env.PORT) || 3000,
  };
}
