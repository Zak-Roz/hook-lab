// CLI entry point. Thin: parses arguments, calls use cases, prints.
//   generate  one script → variants + brief (batch use, recording the mock)
//   stats     pilot metrics from logs/sessions.jsonl (written by the web app)
//   eval      compare prompt versions on all sample scripts (live API only)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { bootstrap } from './bootstrap.ts';
import { ANGLES, isAngle } from './domain/angles.ts';
import { evalMarkdown, pct, summarizeEval } from './domain/eval-report.ts';
import { computeMetrics } from './domain/metrics.ts';
import { FIELD_LABEL } from './domain/validation.ts';
import { loadSampleScripts, writeOutput } from './infra/files.ts';
import { readEvents } from './infra/session-log.ts';
import { WORD_LIMIT_STYLES } from './llm/prompt.ts';
import type { WordLimitStyle } from './llm/prompt.ts';
import { exportBrief } from './use-cases/export-brief.ts';
import { DEFAULT_COUNT, generateVariations } from './use-cases/generate-variations.ts';
import type { GeneratedVariant } from './use-cases/generate-variations.ts';
import { runEval } from './use-cases/run-eval.ts';

const USAGE = `Usage:
  npm run generate -- <script.txt> [options]   one script → variants + brief
  npm run stats [-- --mock]                    pilot metrics from the web app log
  npm run eval [-- --styles margin,count --repeat 1]   compare prompt versions (live API)

generate options:
  --count <n>        variants to generate (default ${DEFAULT_COUNT}, max 20)
  --angles <list>    comma-separated: ${ANGLES.join(', ')}
  --topic <topic>    library topic for examples (default: "Topic:" line of the script)
  --select <list>    variant numbers to put in the brief, e.g. 1,4,7 (default: all without errors)
  --no-repair        don't send variants with errors back to the model
  --style <style>    prompt version for word limits: ${WORD_LIMIT_STYLES.join(' | ')}
  --mock             replay the answers recorded in data/mock/ instead of calling the API
  --record-mock      save this run's model answers to data/mock/
  --json             print the result as JSON`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

const STATUS = {
  ok: styleText('green', '✓ ok  '),
  warn: styleText('yellow', '! warn'),
  error: styleText('red', '✗ err '),
} as const;

function printVariant(v: GeneratedVariant): void {
  const fixedMark = v.fixed ? styleText('cyan', ' ↻ auto-fixed') : '';
  console.log(`${STATUS[v.status]} ${styleText('bold', v.id)} [${v.angle}] ${v.hook}${fixedMark}`);
  console.log(`        on-screen:  ${v.on_screen_text}`);
  console.log(`        first line: ${v.first_line}`);
  console.log(`        visual:     ${v.visual_idea}`);
  for (const issue of v.fixed ?? []) console.log(styleText('cyan', `        fixed: ${issue.message}`));
  for (const issue of v.issues) {
    const where = FIELD_LABEL[issue.field].toLowerCase();
    console.log(styleText(issue.severity === 'error' ? 'red' : 'yellow', `        ${issue.severity} (${where}): ${issue.message}`));
  }
  console.log();
}

async function runGenerate(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      count: { type: 'string', default: String(DEFAULT_COUNT) },
      angles: { type: 'string', default: '' },
      topic: { type: 'string' },
      select: { type: 'string' },
      mock: { type: 'boolean', default: false },
      'no-repair': { type: 'boolean', default: false },
      style: { type: 'string' },
      'record-mock': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const file = positionals[0] ?? fail('Missing script file');
  const angles = values.angles.split(',').map((a) => a.trim()).filter(Boolean);
  const unknown = angles.filter((a) => !isAngle(a));
  if (unknown.length) fail(`Unknown angle(s): ${unknown.join(', ')}`);

  const style = parseStyles(values.style)[0];

  const app = bootstrap({ forceMock: values.mock });
  const script = readFileSync(file, 'utf8');
  const result = await generateVariations(
    {
      script, count: Number(values.count), angles: angles.filter(isAngle), topic: values.topic,
      repair: !values['no-repair'], wordLimitStyle: style,
    },
    app,
  );

  if (values['record-mock']) {
    if (result.mock) fail('--record-mock needs a real API run, not --mock');
    // Replace the whole recording, so a step from an older run can't mix with this one.
    mkdirSync(app.paths.mock, { recursive: true });
    for (const step of ['generate', 'repair'] as const) {
      const path = join(app.paths.mock, `${step}.json`);
      const text = result.raw[step];
      if (text) writeFileSync(path, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
      else rmSync(path, { force: true });
    }
  }

  const picked = values.select
    ? values.select.split(',').map((n) => result.variants[Number(n.trim()) - 1]).filter(Boolean)
    : result.variants.filter((v) => v.status !== 'error');
  const brief = picked.length
    ? exportBrief({ script, original: result.original, variants: picked, model: result.model }, { brand: app.brand, outputDir: app.paths.output })
    : undefined;

  if (values.json) {
    const { raw: _raw, ...rest } = result;
    console.log(JSON.stringify({ ...rest, brief: brief?.files }, null, 2));
    return;
  }

  const { usage } = result;
  const cost = usage.cost_usd === null ? '?' : `$${usage.cost_usd}`;
  console.log(
    `\n${result.model}${result.mock ? ' (mock)' : ''} · ${(result.durationMs / 1000).toFixed(1)}s · ` +
      `${usage.input_tokens} in / ${usage.output_tokens} out tokens · ${cost}\n`,
  );
  console.log(styleText('dim', `Original: "${result.original.hook}" / on-screen "${result.original.on_screen_text}"\n`));
  result.variants.forEach(printVariant);

  const counts = { ok: 0, warn: 0, error: 0 };
  for (const v of result.variants) counts[v.status]++;
  console.log(`${counts.ok} ok · ${counts.warn} to check · ${counts.error} with errors`);
  const { repair } = result;
  if (repair.attempted) {
    const note = repair.error ? styleText('red', ` (repair failed: ${repair.error})`) : '';
    console.log(`Auto-fix: ${repair.fixed} of ${repair.attempted} variant(s) with errors fixed${note}`);
  }
  if (values['record-mock']) console.log(`Mock answers saved to ${app.paths.mock}`);
  if (brief) console.log(`Brief: ${brief.files.markdown}\n       ${brief.files.csv}`);
}

function parseStyles(list: string | undefined): WordLimitStyle[] {
  if (!list) return [];
  const styles = list.split(',').map((s) => s.trim());
  const bad = styles.filter((s) => !(WORD_LIMIT_STYLES as readonly string[]).includes(s));
  if (bad.length) fail(`Unknown style(s): ${bad.join(', ')}. Use: ${WORD_LIMIT_STYLES.join(', ')}`);
  return styles as WordLimitStyle[];
}

function runStats(args: string[]): void {
  const { values } = parseArgs({ args, options: { mock: { type: 'boolean', default: false } } });
  const app = bootstrap();
  const m = computeMetrics(readEvents(app.paths.logs), { includeMock: values.mock });
  if (!m.sessions) {
    console.log(`No ${values.mock ? '' : 'live '}sessions in ${app.paths.logs} yet. Use the web app (npm start)${values.mock ? '' : ', or add --mock to include mock runs'}.`);
    return;
  }
  const sec = (x: number | null) => (x === null ? '—' : `${Math.round(x)} s`);
  const rows: [string, string][] = [
    ['Sessions (generated / exported)', `${m.sessions} / ${m.exportedSessions}`],
    ['Variants generated', String(m.variants)],
    ['Valid, first pass', pct(m.firstPassValidRate)],
    ['Valid, after auto-fix', pct(m.validRate)],
    ['Auto-fixed', `${m.repairFixed} of ${m.repairAttempted}`],
    ['Acceptance (taken into brief)', pct(m.acceptanceRate)],
    ['Edited before export', pct(m.editRate)],
    ['Median time, generate → export', sec(m.medianSecondsToExport)],
    ['Avg generation time', sec(m.avgDurationSec)],
    ['Avg cost per generation', m.avgCostUsd === null ? '—' : `$${m.avgCostUsd.toFixed(3)}`],
  ];
  console.log();
  for (const [k, v] of rows) console.log(`${k.padEnd(34)} ${v}`);
  if (m.byAngle.length) {
    console.log('\nAcceptance by angle:');
    for (const a of m.byAngle) console.log(`  ${a.angle.padEnd(14)} ${pct(a.takeRate).padStart(4)}  (${a.taken}/${a.shown})`);
  }
  console.log();
}

async function runEvalCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      styles: { type: 'string', default: WORD_LIMIT_STYLES.join(',') },
      repeat: { type: 'string', default: '1' },
    },
  });
  const app = bootstrap();
  if (app.writer.isMock) fail('eval needs the live API: a recorded mock answer says nothing about prompt quality. Set ANTHROPIC_API_KEY in .env.');

  const scripts = loadSampleScripts(app.paths.scripts);
  const styles = parseStyles(values.styles);
  const repeats = Math.max(1, Number(values.repeat) || 1);
  console.log(`Running ${styles.length} prompt style(s) × ${scripts.length} scripts × ${repeats} …`);

  const runs = await runEval(app, {
    scripts, styles, repeats,
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total} runs done`),
  });
  process.stdout.write('\n');
  if (runs.every((r) => r.error)) throw new Error(`every run failed, no report written. First error: ${runs[0]?.error}`);

  const date = new Date();
  const report = evalMarkdown(runs, { date, model: app.writer.model });
  const path = writeOutput(app.paths.eval, `eval-${date.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`, report);

  console.log();
  console.log(`${'style'.padEnd(8)} ${'valid 1st'.padStart(9)} ${'valid final'.padStart(11)} ${'fixed'.padStart(7)} ${'avg s'.padStart(6)} ${'avg $'.padStart(7)}`);
  for (const s of summarizeEval(runs)) {
    console.log(
      `${s.style.padEnd(8)} ${pct(s.firstPassValidRate).padStart(9)} ${pct(s.finalValidRate).padStart(11)} ` +
        `${`${s.repairFixed}/${s.repairAttempted}`.padStart(7)} ${(s.avgDurationSec ?? 0).toFixed(1).padStart(6)} ${(s.avgCostUsd ?? 0).toFixed(3).padStart(7)}` +
        (s.failedRuns ? styleText('red', `  (${s.failedRuns} run(s) failed)`) : ''),
    );
  }
  console.log(`\nReport with every variant: ${path}\nFill its "Usable?" column by hand to score quality.`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'generate':
      await runGenerate(rest);
      break;
    case 'stats':
      runStats(rest);
      break;
    case 'eval':
      await runEvalCommand(rest);
      break;
    default:
      fail(command ? `Unknown command "${command}"` : 'Missing command');
  }
} catch (error) {
  // Expected failures (no mock file, API error, bad input) get one readable line, not a stack trace.
  console.error(styleText('red', `Error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
}
