import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadBrand, loadLibrary } from '../infra/files.ts';
import { PATHS } from '../infra/paths.ts';
import type { HookWriter, WriterRequest } from '../llm/hook-writer.ts';
import { generateVariations } from './generate-variations.ts';

const ORIGINAL = { hook: 'There is a tiny magnet in these socks.', first_line: 'f', on_screen_text: 'o', core_promise: 'p' };

const v = (hook: string, angle = 'pain') => ({
  angle, hook, first_line: 'Here is why.', on_screen_text: 'Watch this', visual_idea: 'Sock in a dryer.', rationale: 'r',
});

/** A fake model: answers per step from a script, records every request. No network, no key. */
function fakeWriter(answers: { generate: object[]; repair?: object[] | Error }) {
  const calls: WriterRequest[] = [];
  const writer: HookWriter = {
    model: 'fake',
    isMock: false,
    async write(request) {
      calls.push(request);
      const usage = { input_tokens: 100, output_tokens: 50, cost_usd: 0.001 };
      if (request.kind === 'generate') return { text: JSON.stringify({ original: ORIGINAL, variants: answers.generate }), usage };
      if (answers.repair instanceof Error) throw answers.repair;
      return { text: JSON.stringify({ variants: answers.repair ?? [] }), usage };
    },
  };
  return { writer, calls };
}

const LONG_HOOK = 'one two three four five six seven eight nine ten eleven twelve thirteen';

describe('generateVariations', () => {
  const brand = loadBrand(PATHS.brand);
  const library = loadLibrary(PATHS.library);

  it('sends the plan to the model and returns checked variants', async () => {
    const { writer, calls } = fakeWriter({ generate: [v('Laundry day ate my sock again.'), v('Watch these come out of the dryer.', 'demo')] });
    const result = await generateVariations(
      { script: 'Title: T\nTopic: laundry-loss\nscript', count: 2, angles: ['pain', 'demo'] },
      { brand, library, writer },
    );
    assert.deepEqual(result.variants.map((x) => x.id), ['M1', 'M2']);
    assert.equal(calls.length, 1, 'no repair call when nothing failed');
    assert.match(calls[0].user, /exactly 2 variants/);
    assert.ok(calls[0].system.includes(brand.facts[0]));
  });

  it('repairs variants with errors in one extra call and reports it', async () => {
    const { writer, calls } = fakeWriter({
      generate: [v('Laundry day ate my sock again.'), v(LONG_HOOK)],
      repair: [v('Another sock vanished in the dryer.')],
    });
    const result = await generateVariations({ script: 'script', count: 2, angles: ['pain'] }, { brand, library, writer });

    assert.equal(calls.length, 2);
    assert.equal(calls[1].kind, 'repair');
    assert.match(calls[1].user, /Hook is 13 words, limit 12/);
    assert.match(calls[1].user, /Laundry day ate my sock again/, 'lists the good hooks so they are not repeated');

    assert.deepEqual(result.repair, { attempted: 1, fixed: 1 });
    assert.deepEqual(result.firstPass, { ok: 1, warn: 0, error: 1 });
    assert.equal(result.variants[1].hook, 'Another sock vanished in the dryer.');
    assert.equal(result.variants[1].status, 'ok');
    assert.match(result.variants[1].fixed![0].message, /13 words/);
    assert.equal(result.usage.input_tokens, 200, 'usage of both calls is summed');
  });

  it('keeps first-pass variants if the repair call fails', async () => {
    const { writer } = fakeWriter({ generate: [v(LONG_HOOK)], repair: new Error('API down') });
    const result = await generateVariations({ script: 'script', count: 1 }, { brand, library, writer });
    assert.equal(result.variants[0].status, 'error');
    assert.deepEqual(result.repair, { attempted: 1, fixed: 0, error: 'API down' });
  });

  it('skips repair when asked', async () => {
    const { writer, calls } = fakeWriter({ generate: [v(LONG_HOOK)] });
    await generateVariations({ script: 'script', count: 1, repair: false }, { brand, library, writer });
    assert.equal(calls.length, 1);
  });

  it('keeps only the requested count', async () => {
    const { writer } = fakeWriter({ generate: [v('Laundry day ate my sock again.'), v('Watch the dryer.'), v('Extra one.')] });
    const result = await generateVariations({ script: 's', count: 2 }, { brand, library, writer });
    assert.equal(result.variants.length, 2);
  });

  it('rejects an empty script before calling the model', async () => {
    const { writer, calls } = fakeWriter({ generate: [] });
    await assert.rejects(generateVariations({ script: '  ' }, { brand, library, writer }), /Script is empty/);
    assert.equal(calls.length, 0);
  });
});
