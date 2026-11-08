// Adapter: HookWriter backed by the Claude API with structured output.
import Anthropic from '@anthropic-ai/sdk';
import type { HookWriter, Usage, WriterRequest, WriterResponse } from './hook-writer.ts';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** USD per million tokens, https://platform.claude.com/docs/en/about-claude/pricing */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(4));
}

export function createAnthropicWriter(options: { apiKey: string; model?: string }): HookWriter {
  const model = options.model ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    model,
    isMock: false,
    async write({ system, user, schema }: WriterRequest): Promise<WriterResponse> {
      const response = await client.messages.create({
        model,
        max_tokens: 6000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema } },
      });
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Model output was cut off (max_tokens). Ask for fewer variants.');
      }
      const block = response.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') throw new Error('Model returned no text block');

      const { input_tokens, output_tokens } = response.usage;
      const usage: Usage = { input_tokens, output_tokens, cost_usd: costUsd(model, input_tokens, output_tokens) };
      return { text: block.text, usage };
    },
  };
}
