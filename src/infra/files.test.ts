import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadBrand, loadLibrary, parseLibraryCsv } from './files.ts';
import { PATHS } from './paths.ts';

const HEADER = 'ad_id,launched,topic,angle,hook,first_line,on_screen_text,spend_usd,romi_pct,hook_rate_pct,ctr_pct';

describe('parseLibraryCsv', () => {
  it('parses quoted cells and numbers', () => {
    const [row] = parseLibraryCsv(`${HEADER}\nW-1,2026-10,gift,demo,"Hi, there",f,o,5000,140,30,1.2\n`);
    assert.equal(row.hook, 'Hi, there');
    assert.equal(row.romi_pct, 140);
  });
  it('fails on an unknown angle or a bad number, naming the line', () => {
    assert.throws(() => parseLibraryCsv(`${HEADER}\nW-1,2026-10,gift,meme,h,f,o,5000,140,30,1.2`), /line 2: unknown angle "meme"/);
    assert.throws(() => parseLibraryCsv(`${HEADER}\nW-1,2026-10,gift,demo,h,f,o,lots,140,30,1.2`), /line 2: spend_usd/);
  });
});

describe('project data', () => {
  it('brand.json and winners.csv load', () => {
    assert.ok(loadBrand(PATHS.brand).facts.length > 0);
    assert.ok(loadLibrary(PATHS.library).length >= 20);
  });
});
