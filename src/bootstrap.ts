// Composition root: the only place that decides which adapters to use.
import { readSettings } from './infra/env.ts';
import { loadBrand, loadLibrary } from './infra/files.ts';
import { PATHS } from './infra/paths.ts';
import { createAnthropicWriter } from './llm/anthropic-writer.ts';
import type { HookWriter } from './llm/hook-writer.ts';
import { createMockWriter } from './llm/mock-writer.ts';

export function bootstrap(options: { forceMock?: boolean } = {}) {
  const settings = readSettings();
  const mock = options.forceMock || settings.mock;
  const writer: HookWriter = mock
    ? createMockWriter(PATHS.mock)
    : createAnthropicWriter({ apiKey: settings.apiKey, model: settings.model });

  return {
    settings,
    paths: PATHS,
    brand: loadBrand(PATHS.brand),
    library: loadLibrary(PATHS.library),
    writer,
  };
}

export type App = ReturnType<typeof bootstrap>;
