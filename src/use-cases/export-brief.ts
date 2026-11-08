// Use case: the variants a designer picked (maybe edited) -> brief files.
import { scriptTitle, slug, toCsv, toMarkdown } from '../domain/brief.ts';
import type { Brand, Original, Variant } from '../domain/types.ts';
import { validateAll } from '../domain/validation.ts';
import type { CheckedVariant } from '../domain/validation.ts';
import { writeOutput } from '../infra/files.ts';

export interface ExportRequest {
  script: string;
  original: Original;
  /** Selected variants; `id` keeps the number they had on screen. */
  variants: (Variant & { id: string })[];
  model: string;
}

export interface ExportDeps {
  brand: Brand;
  outputDir: string;
  now?: () => Date;
}

export interface ExportResult {
  markdown: string;
  csv: string;
  files: { markdown: string; csv: string };
  variants: CheckedVariant[];
}

export function exportBrief(req: ExportRequest, deps: ExportDeps): ExportResult {
  if (!req.variants.length) throw new Error('Select at least one variant');
  const createdAt = (deps.now ?? (() => new Date()))();

  // Designers may have edited the text, so check it again and keep their numbering.
  const checked = validateAll(req.variants, req.original, deps.brand).map((v, i) => ({ ...v, id: req.variants[i].id }));
  const input = { script: req.script, original: req.original, variants: checked, model: req.model, createdAt };
  const markdown = toMarkdown(input);
  const csv = toCsv(input);

  const base = `brief-${slug(scriptTitle(req.script))}-${createdAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  return {
    markdown,
    csv,
    files: {
      markdown: writeOutput(deps.outputDir, `${base}.md`, markdown),
      csv: writeOutput(deps.outputDir, `${base}.csv`, csv),
    },
    variants: checked,
  };
}
