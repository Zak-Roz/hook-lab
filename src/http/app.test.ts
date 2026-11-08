import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { App } from '../bootstrap.ts';
import { readSettings } from '../infra/env.ts';
import { loadBrand, loadLibrary } from '../infra/files.ts';
import { PATHS } from '../infra/paths.ts';
import type { HookWriter } from '../llm/hook-writer.ts';
import { createHttpApp } from './app.ts';

const tmp = mkdtempSync(join(tmpdir(), 'hook-lab-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const writer: HookWriter = {
  model: 'fake',
  isMock: true,
  async write() {
    const v = (hook: string, angle: string) => ({ angle, hook, first_line: 'Here is why.', on_screen_text: 'Watch this', visual_idea: 'A dryer.', rationale: 'r' });
    return {
      text: JSON.stringify({
        original: { hook: 'There is a tiny magnet in these socks.', first_line: 'f', on_screen_text: 'o', core_promise: 'p' },
        variants: [v('Laundry day ate my sock again.', 'pain'), v('Watch these come out of the dryer.', 'demo')],
      }),
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    };
  },
};

const app: App = {
  settings: readSettings(),
  paths: { ...PATHS, logs: join(tmp, 'logs'), output: join(tmp, 'out') },
  brand: loadBrand(PATHS.brand),
  library: loadLibrary(PATHS.library),
  writer,
};
const http = createHttpApp(app, { now: () => new Date('2026-11-08T10:00:00Z') });

const post = (path: string, body: unknown) =>
  http.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('HTTP API', () => {
  it('serves the page and the config', async () => {
    assert.equal((await http.request('/')).status, 200);
    const config = (await (await http.request('/api/config')).json()) as { angles: unknown[]; samples: unknown[]; mock: boolean };
    assert.equal(config.angles.length, 8);
    assert.ok(config.samples.length >= 3);
    assert.equal(config.mock, true);
  });

  it('runs generate → check → export and logs the session', async () => {
    const gen = (await (await post('/api/generate', { script: 'Title: T\nscript', count: 2 })).json()) as {
      sessionId: string;
      variants: Record<string, string>[];
    };
    assert.equal(gen.variants.length, 2);

    const edited = { ...gen.variants[1], hook: 'Get a free pair' };
    const check = (await (await post('/api/check', { sessionId: gen.sessionId, variant: edited })).json()) as { status: string };
    assert.equal(check.status, 'error');

    const res = await post('/api/export', { sessionId: gen.sessionId, variants: [gen.variants[0], { ...gen.variants[1], hook: 'Watch them come out paired.' }] });
    assert.equal(res.status, 200);
    const brief = (await res.json()) as { files: { markdown: string }; markdown: string };
    assert.ok(existsSync(brief.files.markdown));
    assert.match(brief.markdown, /Watch them come out paired/);

    const log = readFileSync(join(tmp, 'logs', 'sessions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(log.map((e) => e.type), ['generated', 'exported']);
    assert.deepEqual(log[1].selected.map((s: { edited: boolean }) => s.edited), [false, true]);

    const stats = (await (await http.request('/api/stats?mock=1')).json()) as { acceptanceRate: number; editRate: number };
    assert.equal(stats.acceptanceRate, 1);
    assert.equal(stats.editRate, 0.5);
  });

  it('answers bad input with 400 and an unknown session with 404', async () => {
    assert.equal((await post('/api/generate', { script: '  ' })).status, 400);
    assert.equal((await post('/api/export', { sessionId: 'nope', variants: [] })).status, 404);
  });
});
