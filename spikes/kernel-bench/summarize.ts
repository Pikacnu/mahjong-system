// Aggregates results/{go,ts}-linux-run*.json into a markdown table (median of runs).
import { Glob } from 'bun';

type Row = {
  variant: string;
  n: number;
  checksum: number;
  decisionsPerSec: number;
  p50us: number;
  p99us: number;
  checksumOk: boolean;
};
type Run = {
  language: string;
  runtime: string;
  micro: { waitsPerSec: number; wallsPerSec: number };
  results: Row[];
};

const dir = new URL('./results/', import.meta.url);
const runs: Run[] = [];
for await (const f of new Glob('*-linux-run*.json').scan(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  runs.push(await Bun.file(new URL(f, dir)).json());
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const byVariant = new Map<string, { lang: string; rows: Row[] }>();
for (const run of runs) {
  for (const row of run.results) {
    if (!row.checksumOk) throw new Error(`${run.language} ${row.variant}: checksum mismatch`);
    const key = `${run.language}|${row.variant}`;
    if (!byVariant.has(key)) byVariant.set(key, { lang: run.language, rows: [] });
    byVariant.get(key)!.rows.push(row);
  }
}

const baseline = median(byVariant.get('go|go native')!.rows.map((r) => r.decisionsPerSec));
const lines = [
  '| Variant | n | runs | decisions/s (median) | range | p50 µs | p99 µs | vs Go native |',
  '| :--- | ---: | ---: | ---: | :--- | ---: | ---: | ---: |',
];
for (const { lang, rows } of byVariant.values()) {
  const tp = rows.map((r) => r.decisionsPerSec);
  const variant = rows[0]!.variant.startsWith('core-only') ? `${lang}: ${rows[0]!.variant}` : rows[0]!.variant;
  lines.push(
    `| ${variant} | ${rows[0]!.n} | ${rows.length} | ${median(tp).toFixed(0)} | ${Math.min(...tp).toFixed(0)}–${Math.max(...tp).toFixed(0)} | ${median(rows.map((r) => r.p50us)).toFixed(1)} | ${median(rows.map((r) => r.p99us)).toFixed(1)} | ${(median(tp) / baseline).toFixed(2)}× |`,
  );
}

const micro = (lang: string, key: 'waitsPerSec' | 'wallsPerSec') =>
  median(runs.filter((r) => r.language === lang).map((r) => r.micro[key]));
lines.push('', '| Builtin | Go | TS (Bun JIT) | Go / TS |', '| :--- | ---: | ---: | ---: |');
for (const [label, key] of [
  ['waits() per 13-tile hand, per second', 'waitsPerSec'],
  ['wall build + shuffle, per second', 'wallsPerSec'],
] as const) {
  const g = micro('go', key);
  const t = micro('ts', key);
  lines.push(`| ${label} | ${g.toFixed(0)} | ${t.toFixed(0)} | ${(g / t).toFixed(2)}× |`);
}

const runtimes = [...new Set(runs.map((r) => `${r.language}: ${r.runtime}`))].join(', ');
console.log(`Runtimes: ${runtimes}. All checksums verified.\n`);
console.log(lines.join('\n'));
