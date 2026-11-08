// HTTP adapter: JSON API for the web page. Thin: parse input, call use cases, log, respond.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { App } from '../bootstrap.ts';
import { ANGLE_GUIDE, ANGLES, isAngle } from '../domain/angles.ts';
import { scriptTitle } from '../domain/brief.ts';
import { angleStats, topics } from '../domain/library.ts';
import { computeMetrics } from '../domain/metrics.ts';
import type { Variant } from '../domain/types.ts';
import { validateAll } from '../domain/validation.ts';
import { loadSampleScripts } from '../infra/files.ts';
import { appendEvent, readEvents } from '../infra/session-log.ts';
import { exportBrief } from '../use-cases/export-brief.ts';
import { DEFAULT_COUNT, MAX_COUNT, generateVariations } from '../use-cases/generate-variations.ts';
import type { GenerationResult } from '../use-cases/generate-variations.ts';

class BadRequest extends Error {}
class NotFound extends Error {}

interface Session {
  script: string;
  result: GenerationResult;
}

const TEXT_FIELDS = ['hook', 'first_line', 'on_screen_text', 'visual_idea', 'rationale'] as const;

function text(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== 'string') throw new BadRequest(`"${field}" must be a string`);
  if (value.length > max) throw new BadRequest(`"${field}" is too long`);
  return value;
}

/** A variant sent back by the page (maybe edited by the designer). */
function parseVariant(raw: unknown): Variant & { id: string } {
  const v = (raw ?? {}) as Record<string, unknown>;
  const angle = text(v.angle, 'angle');
  if (!isAngle(angle)) throw new BadRequest(`Unknown angle "${angle}"`);
  const out = { id: text(v.id, 'id', 10), angle } as Variant & { id: string };
  for (const f of TEXT_FIELDS) out[f] = text(v[f] ?? '', f, 1000).trim();
  return out;
}

export function createHttpApp(app: App, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const sessions = new Map<string, Session>(); // in memory: enough for a single-user MVP
  const samples = loadSampleScripts(app.paths.scripts);
  const stats = angleStats(app.library);

  const http = new Hono();

  http.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    if (err instanceof NotFound) return c.json({ error: err.message }, 404);
    console.error(err);
    return c.json({ error: err.message || 'Unexpected error' }, 500);
  });

  http.get('/', (c) => c.html(readFileSync(join(app.paths.public, 'index.html'), 'utf8')));

  http.get('/api/config', (c) =>
    c.json({
      mock: app.writer.isMock,
      model: app.writer.model,
      defaultCount: DEFAULT_COUNT,
      maxCount: MAX_COUNT,
      limits: app.brand.limits,
      topics: topics(app.library),
      angles: ANGLES.map((angle) => ({
        angle,
        guide: ANGLE_GUIDE[angle],
        romi: stats.find((s) => s.angle === angle)?.romi_pct ?? null,
      })),
      samples,
    }),
  );

  http.post('/api/generate', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const script = text(body.script, 'script', 20_000);
    if (!script.trim()) throw new BadRequest('Paste a winning script first');
    const angles = Array.isArray(body.angles) ? body.angles.filter((a): a is string => typeof a === 'string') : [];
    const topic = typeof body.topic === 'string' && body.topic ? body.topic : undefined;

    const result = await generateVariations(
      { script, count: Number(body.count) || DEFAULT_COUNT, angles: angles.filter(isAngle), topic },
      app,
    );

    const sessionId = randomUUID();
    sessions.set(sessionId, { script, result });
    appendEvent(app.paths.logs, {
      type: 'generated',
      session_id: sessionId,
      at: now().toISOString(),
      script_title: scriptTitle(script),
      model: result.model,
      mock: result.mock,
      variants: result.variants.map(({ id, angle, status }) => ({ id, angle, status })),
      first_pass: result.firstPass,
      repair: { attempted: result.repair.attempted, fixed: result.repair.fixed },
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cost_usd: result.usage.cost_usd,
      duration_ms: result.durationMs,
    });

    const { raw: _raw, ...rest } = result;
    return c.json({ sessionId, ...rest });
  });

  function session(id: unknown): Session {
    const s = typeof id === 'string' ? sessions.get(id) : undefined;
    if (!s) throw new NotFound('Session not found (the server was restarted?). Generate again.');
    return s;
  }

  // Re-check one variant after the designer edits it.
  http.post('/api/check', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const { result } = session(body.sessionId);
    const variant = parseVariant(body.variant);
    const [checked] = validateAll([variant], result.original, app.brand);
    return c.json({ status: checked.status, issues: checked.issues });
  });

  http.post('/api/export', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const { script, result } = session(body.sessionId);
    if (!Array.isArray(body.variants) || !body.variants.length) throw new BadRequest('Select at least one variant');
    const picked = body.variants.map(parseVariant);

    const brief = exportBrief(
      { script, original: result.original, variants: picked, model: result.model },
      { brand: app.brand, outputDir: app.paths.output, now },
    );

    const generatedById = new Map(result.variants.map((v) => [v.id, v]));
    appendEvent(app.paths.logs, {
      type: 'exported',
      session_id: String(body.sessionId),
      at: now().toISOString(),
      selected: picked.map((v) => {
        const before = generatedById.get(v.id);
        return { id: v.id, angle: v.angle, edited: !before || TEXT_FIELDS.some((f) => before[f] !== v[f]) };
      }),
    });

    return c.json(brief);
  });

  http.get('/api/stats', (c) => c.json(computeMetrics(readEvents(app.paths.logs), { includeMock: c.req.query('mock') === '1' })));

  return http;
}
