import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Brand, Original, Variant } from './types.ts';
import { checkVariant, containsPhrase, jaccard, validateAll, wordCount } from './validation.ts';

const brand: Brand = {
  product: 'SockLock',
  facts: [],
  audience: '',
  tone: '',
  limits: { hookMaxWords: 12, onScreenMaxWords: 7, firstLineMaxWords: 20 },
  allowedNumbers: ['5', '29'],
  allowedPrices: ['$29'],
  bannedPhrases: [
    { pattern: 'free', reason: 'Nothing is free' },
    { pattern: '100%', reason: 'Absolute claim' },
  ],
  similarityThreshold: 0.6,
};

const original: Original = {
  hook: "There's a tiny magnet hidden in these socks.",
  first_line: 'And it fixes the most annoying chore in my house.',
  on_screen_text: 'The tiny magnet trick',
  core_promise: 'Socks stay paired in the wash.',
};

const good: Variant = {
  angle: 'pain',
  hook: 'Laundry day ate another sock again.',
  first_line: 'I was done buying socks every month.',
  on_screen_text: 'Where did it go?',
  visual_idea: 'Hand pulls a single sock out of the dryer.',
  rationale: 'Everyone has lost a sock.',
};

describe('wordCount', () => {
  it('counts words and ignores arrows and dashes', () => {
    assert.equal(wordCount('20 min → 0 min'), 4);
    assert.equal(wordCount('Snap. Paired. Done.'), 3);
    assert.equal(wordCount('  '), 0);
  });
});

describe('jaccard', () => {
  it('is 1 for the same words and 0 for none shared', () => {
    assert.equal(jaccard('tiny magnet socks', 'Socks, tiny magnet!'), 1);
    assert.equal(jaccard('tiny magnet', 'laundry day'), 0);
  });
  it('ignores stopwords', () => {
    assert.equal(jaccard('the sock', 'a sock'), 1);
  });
});

describe('containsPhrase', () => {
  it('matches whole words only', () => {
    assert.equal(containsPhrase('Get them free today', 'free'), true);
    assert.equal(containsPhrase('A carefree morning', 'free'), false);
  });
  it('matches symbols as plain text', () => {
    assert.equal(containsPhrase('Works 100% of the time', '100%'), true);
  });
});

describe('checkVariant', () => {
  it('passes a clean variant', () => {
    assert.deepEqual(checkVariant(good, brand, original, 'pain'), []);
  });

  it('flags text over the word limit as an error', () => {
    const issues = checkVariant({ ...good, on_screen_text: 'one two three four five six seven eight' }, brand, original);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].field, 'on_screen_text');
    assert.equal(issues[0].severity, 'error');
  });

  it('flags banned phrases and wrong prices as errors', () => {
    const issues = checkVariant({ ...good, hook: 'Get a free pair for $19' }, brand, original);
    assert.deepEqual(issues.map((i) => i.severity), ['error', 'error']);
    assert.match(issues[1].message, /\$19/);
  });

  it('allows the real price and offer numbers', () => {
    assert.deepEqual(checkVariant({ ...good, hook: '5 pairs for $29.' }, brand, original), []);
  });

  it('warns about numbers that may be made-up stats', () => {
    for (const hook of ['87% of socks get lost.', 'I counted 14 single socks.', 'Pairing takes 2.5 seconds.']) {
      const issues = checkVariant({ ...good, hook }, brand, original);
      assert.equal(issues.length, 1, hook);
      assert.equal(issues[0].severity, 'warn');
    }
  });

  it('lets small everyday counts through', () => {
    assert.deepEqual(checkVariant({ ...good, on_screen_text: '3 places, 1 missing sock' }, brand, original), []);
  });

  it('flags a hook that copies the original', () => {
    const issues = checkVariant({ ...good, hook: 'A tiny magnet is hidden in these socks.' }, brand, original);
    assert.ok(issues.some((i) => i.severity === 'error' && /original/.test(i.message)));
  });

  it('warns when the angle differs from the plan', () => {
    const issues = checkVariant(good, brand, original, 'demo');
    assert.equal(issues[0].field, 'angle');
    assert.equal(issues[0].severity, 'warn');
  });
});

describe('validateAll', () => {
  it('numbers variants, marks near-duplicates and sets status', () => {
    const result = validateAll(
      [good, { ...good, hook: 'Laundry day ate another sock.' }, { ...good, hook: '87 socks lost.' }],
      original,
      brand,
    );
    assert.deepEqual(result.map((v) => v.id), ['M1', 'M2', 'M3']);
    assert.deepEqual(result.map((v) => v.status), ['ok', 'error', 'warn']);
    assert.match(result[1].issues[0].message, /Near-duplicate of M1/);
  });
});
