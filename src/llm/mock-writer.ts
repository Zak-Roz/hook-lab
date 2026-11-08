// Adapter: HookWriter that replays recorded real answers (data/mock/<step>.json).
// Lets anyone run the tool without an API key: demo, review, tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HookWriter, WriterRequest, WriterResponse } from './hook-writer.ts';

export function createMockWriter(dir: string): HookWriter {
  return {
    model: 'mock',
    isMock: true,
    async write({ kind }: WriterRequest): Promise<WriterResponse> {
      const path = join(dir, `${kind}.json`);
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        throw new Error(`No recorded "${kind}" answer at ${path}. Record one with: npm run generate -- <script> --record-mock`);
      }
      return { text, usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 } };
    },
  };
}
