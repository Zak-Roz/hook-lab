import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvCell, scriptTitle, slug, toCsv, toMarkdown } from './brief.ts';
import type { BriefInput } from './brief.ts';

const input: BriefInput = {
  script: 'Title: Tiny magnet (W-105)\nTopic: laundry-loss\n\n[HOOK - VO] There is a tiny magnet.',
  original: { hook: 'There is a tiny magnet.', first_line: 'f', on_screen_text: 'o', core_promise: 'p' },
  variants: [
    {
      id: 'M3', angle: 'demo', hook: 'Watch this, "magic"', first_line: 'f, then g', on_screen_text: 'Snap.',
      visual_idea: 'v', rationale: 'r', status: 'warn',
      issues: [{ field: 'hook', severity: 'warn', message: 'check me' }],
    },
  ],
  model: 'claude-sonnet-5-5',
  createdAt: new Date('2026-11-08T12:00:00Z'),
};

describe('scriptTitle / slug', () => {
  it('reads the Title line, else the first line', () => {
    assert.equal(scriptTitle(input.script), 'Tiny magnet (W-105)');
    assert.equal(scriptTitle('\nFirst real line\nmore'), 'First real line');
    assert.equal(slug('Tiny magnet (W-105)'), 'tiny-magnet-w-105');
  });
});

describe('toMarkdown', () => {
  it('has the title, each variant, its checks and the source script', () => {
    const md = toMarkdown(input);
    assert.match(md, /^# Modification brief — Tiny magnet \(W-105\)/);
    assert.match(md, /### M3 · demo/);
    assert.match(md, /\*\*Check \(warn, hook\):\*\* check me/);
    assert.match(md, /```text\nTitle: Tiny magnet/);
  });
});

describe('CSV', () => {
  it('quotes cells with commas, quotes or line breaks', () => {
    assert.equal(csvCell('plain'), 'plain');
    assert.equal(csvCell('a, b'), '"a, b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('two\nlines'), '"two\nlines"');
  });
  it('writes a header and one row per variant', () => {
    const lines = toCsv(input).trim().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^source,variant,angle,hook/);
    assert.match(lines[1], /^Tiny magnet \(W-105\),M3,demo,"Watch this, ""magic""",Snap\.,"f, then g"/);
  });
});
