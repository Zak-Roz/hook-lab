// Turns the variants a designer picked into a brief (Markdown) and an Airtable-ready CSV.
import type { Original } from './types.ts';
import { FIELD_LABEL } from './validation.ts';
import type { CheckedVariant } from './validation.ts';

export interface BriefInput {
  script: string;
  original: Original;
  variants: CheckedVariant[];
  model: string;
  createdAt: Date;
}

/** "Title: Tiny magnet (W-105)" header, or the first non-empty line. */
export function scriptTitle(script: string): string {
  const title = script.match(/^Title:\s*(.+)$/m)?.[1];
  const firstLine = script.split('\n').find((l) => l.trim());
  return (title ?? firstLine ?? 'Untitled script').trim().slice(0, 80);
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brief';
}

function stamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function toMarkdown({ script, original, variants, model, createdAt }: BriefInput): string {
  const lines: string[] = [
    `# Modification brief — ${scriptTitle(script)}`,
    '',
    `${stamp(createdAt)} UTC · ${model} · ${variants.length} variant(s)`,
    '',
    '**Keep unchanged:** the body and the CTA of the source script (at the end of this brief). Replace only the first 3 seconds.',
    '',
    `**Original opening:** hook "${original.hook}" · on-screen "${original.on_screen_text}" · first line "${original.first_line}"`,
    '',
    '## Variants',
  ];

  for (const v of variants) {
    lines.push(
      '',
      `### ${v.id} · ${v.angle}`,
      '',
      `- **Hook (VO, 0–3 s):** ${v.hook}`,
      `- **On-screen text:** ${v.on_screen_text}`,
      `- **First line (VO):** ${v.first_line}`,
      `- **Visual, first 3 s:** ${v.visual_idea}`,
      `- **Why it should work:** ${v.rationale}`,
    );
    for (const issue of v.issues) {
      lines.push(`- **Check (${issue.severity}, ${FIELD_LABEL[issue.field].toLowerCase()}):** ${issue.message}`);
    }
  }

  lines.push('', '## Source script', '', '```text', script.trim(), '```', '');
  return lines.join('\n');
}

/** RFC 4180: quote a cell if it has a comma, quote or line break; double inner quotes. */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  'source', 'variant', 'angle', 'hook', 'on_screen_text', 'first_line', 'visual_idea', 'rationale', 'checks', 'status',
] as const;

export function toCsv({ script, variants }: BriefInput): string {
  const source = scriptTitle(script);
  const rows = variants.map((v) => [
    source, v.id, v.angle, v.hook, v.on_screen_text, v.first_line, v.visual_idea, v.rationale,
    v.issues.map((i) => `${i.severity} (${FIELD_LABEL[i.field].toLowerCase()}): ${i.message}`).join('; '),
    'To do',
  ]);
  return [CSV_COLUMNS as readonly string[], ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
