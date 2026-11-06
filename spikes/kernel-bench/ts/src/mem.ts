// Memory per isolation unit: QuickJS runtime (one per game) vs Bun Worker (current runner design).
// Usage: bun run src/mem.ts <quickjs|worker> <count>
import { getQuickJS } from 'quickjs-emscripten';

const [mode = 'quickjs', countArg = '300'] = process.argv.slice(2);
const count = Number(countArg);
const ruleSrc = await Bun.file(new URL('./rule.js', import.meta.url)).text();

const rssMb = () => process.memoryUsage().rss / 1024 / 1024;
const settle = async () => {
  Bun.gc(true);
  await Bun.sleep(200);
};

await settle();
const before = rssMb();
const keep: unknown[] = [];

if (mode === 'quickjs') {
  const QuickJS = await getQuickJS();
  for (let i = 0; i < count; i++) {
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(8 * 1024 * 1024);
    const ctx = runtime.newContext();
    ctx.unwrapResult(ctx.evalCode(ruleSrc)).dispose();
    // Per-game plugin state, roughly the furiten storage shape.
    ctx.unwrapResult(ctx.evalCode('globalThis.state = { discards: {}, furiten: {}, turn: 0 };')).dispose();
    keep.push(ctx, runtime);
  }
} else {
  for (let i = 0; i < count; i++) {
    const w = new Worker(new URL('./rule-worker.ts', import.meta.url));
    await new Promise<void>((r) => (w.onmessage = () => r()));
    keep.push(w);
  }
}

await settle();
const after = rssMb();
console.log(
  JSON.stringify({
    mode,
    count,
    rssBeforeMb: +before.toFixed(1),
    rssAfterMb: +after.toFixed(1),
    perUnitMb: +((after - before) / count).toFixed(3),
  }),
);
process.exit(0);
