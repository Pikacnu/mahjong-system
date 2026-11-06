import * as grpc from '@grpc/grpc-js';
import { getQuickJS } from 'quickjs-emscripten';
import { buildWall, createRng, waits } from './core';
import { ruleServiceDefinition } from './grpc-server';
import {
  checksumOf,
  evaluateCore,
  generateSituations,
  responders,
  toWire,
  type RuleInput,
  type RuleOutput,
  type Situation,
} from './workload';

const SEED = 12345;
const TOTAL = 20_000;
const REPS = 5;

type RunFn = (inputs: RuleInput[]) => RuleOutput[] | Promise<RuleOutput[]>;
type Variant = {
  name: string;
  n: number;
  setup: () => Promise<RunFn>;
  teardown?: () => void | Promise<void>;
};

const ruleSrc = await Bun.file(new URL('./rule.js', import.meta.url)).text();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function percentile(sorted: Float64Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

async function runPass(run: RunFn, sits: Situation[], n: number) {
  const lat = new Float64Array(n);
  let checksum = 0;
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) {
    const s = Bun.nanoseconds();
    const sit = sits[i]!;
    const cores = responders(sit).map((p) => evaluateCore(sit, p));
    const r = run(cores.map((c) => c.input));
    const outs = r instanceof Promise ? await r : r;
    for (let j = 0; j < cores.length; j++) {
      const c = cores[j]!;
      checksum += checksumOf(c.input.ronDecomps, c.input.waits.length, c.canPon, c.canChi, outs[j]!);
    }
    lat[i] = Bun.nanoseconds() - s;
  }
  const totalNs = Bun.nanoseconds() - t0;
  lat.sort();
  return {
    checksum,
    perSec: n / (totalNs / 1e9),
    p50us: percentile(lat, 0.5) / 1e3,
    p99us: percentile(lat, 0.99) / 1e3,
  };
}

async function measure(v: Variant, sits: Situation[]) {
  const run = await v.setup();
  await runPass(run, sits, Math.min(v.n, 2000)); // warmup
  const reps = [];
  for (let i = 0; i < REPS; i++) reps.push(await runPass(run, sits, v.n));
  await v.teardown?.();
  const checksums = new Set(reps.map((r) => r.checksum));
  if (checksums.size !== 1) throw new Error(`${v.name}: checksum differs between reps`);
  return {
    variant: v.name,
    n: v.n,
    checksum: reps[0]!.checksum,
    decisionsPerSec: median(reps.map((r) => r.perSec)),
    p50us: median(reps.map((r) => r.p50us)),
    p99us: median(reps.map((r) => r.p99us)),
  };
}

const nativeEvaluate = new Function(`${ruleSrc}\nreturn evaluate;`)() as (
  x: RuleInput,
) => RuleOutput;

// --- variants -------------------------------------------------------------

let worker: Worker | null = null;
let grpcProc: ReturnType<typeof Bun.spawn> | null = null;
let grpcClient: grpc.Client | null = null;

function workerCall(inputs: RuleInput[]): Promise<RuleOutput[]> {
  return new Promise((resolve) => {
    worker!.onmessage = (e: MessageEvent) => resolve(e.data.outputs);
    worker!.postMessage({ id: 0, inputs });
  });
}

function grpcCall(inputs: RuleInput[]): Promise<RuleOutput[]> {
  const body = Buffer.from(JSON.stringify(inputs.map(toWire)), 'utf8');
  return new Promise((resolve, reject) => {
    grpcClient!.makeUnaryRequest(
      ruleServiceDefinition.evaluate.path,
      (b: Buffer) => b,
      (b: Buffer) => b,
      body,
      (err, res) => (err ? reject(err) : resolve(JSON.parse(res!.toString('utf8')))),
    );
  });
}

async function perCall(inputs: RuleInput[], call: (x: RuleInput[]) => Promise<RuleOutput[]>) {
  const outs: RuleOutput[] = [];
  for (const input of inputs) outs.push((await call([input]))[0]!);
  return outs;
}

const variants: Variant[] = [
  {
    name: 'core-only (no rule)',
    n: TOTAL,
    setup: async () => (inputs) =>
      inputs.map(() => ({ furiten: false, tanyao: false, yakuhai: 0, canRon: false })),
  },
  {
    name: 'ts native JIT',
    n: TOTAL,
    setup: async () => (inputs) => inputs.map(nativeEvaluate),
  },
  {
    name: 'ts native JIT + JSON marshal (boundary cost only)',
    n: TOTAL,
    setup: async () => (inputs) =>
      inputs.map(
        (input) =>
          JSON.parse(
            JSON.stringify(nativeEvaluate(JSON.parse(JSON.stringify(toWire(input))))),
          ) as RuleOutput,
      ),
  },
  {
    name: 'ts + QuickJS in-process',
    n: TOTAL,
    setup: async () => {
      const QuickJS = await getQuickJS();
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(32 * 1024 * 1024);
      runtime.setInterruptHandler(() => false);
      const ctx = runtime.newContext();
      ctx.unwrapResult(
        ctx.evalCode(`${ruleSrc}\nglobalThis.evaluateJson = (s) => JSON.stringify(evaluate(JSON.parse(s)));`),
      ).dispose();
      const fn = ctx.getProp(ctx.global, 'evaluateJson');
      return (inputs) =>
        inputs.map((input) => {
          const arg = ctx.newString(JSON.stringify(toWire(input)));
          const res = ctx.unwrapResult(ctx.callFunction(fn, ctx.undefined, arg));
          arg.dispose();
          const out = JSON.parse(ctx.getString(res));
          res.dispose();
          return out;
        });
    },
  },
  {
    name: 'ts + QuickJS new context per call (current RunFunction)',
    n: 1_000,
    setup: async () => {
      const QuickJS = await getQuickJS();
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(32 * 1024 * 1024);
      return (inputs) =>
        inputs.map((input) => {
          const ctx = runtime.newContext();
          ctx.unwrapResult(ctx.evalCode(ruleSrc)).dispose();
          const fn = ctx.getProp(ctx.global, 'evaluate');
          const json = ctx.unwrapResult(ctx.evalCode(`(${JSON.stringify(toWire(input))})`));
          const res = ctx.unwrapResult(ctx.callFunction(fn, ctx.undefined, json));
          const out = ctx.dump(res) as RuleOutput;
          res.dispose();
          json.dispose();
          fn.dispose();
          ctx.dispose();
          return out;
        });
    },
  },
  {
    name: 'ts + Worker JIT, 1 message per player',
    n: 5_000,
    setup: async () => {
      worker = new Worker(new URL('./rule-worker.ts', import.meta.url));
      await new Promise<void>((r) => (worker!.onmessage = () => r()));
      return (inputs) => perCall(inputs, workerCall);
    },
  },
  {
    name: 'ts + Worker JIT, 1 message per decision',
    n: 5_000,
    setup: async () => workerCall,
    teardown: () => worker?.terminate(),
  },
  {
    name: 'ts + remote gRPC runner, 1 call per player',
    n: 2_000,
    setup: async () => {
      grpcProc = Bun.spawn(['bun', 'src/grpc-server.ts'], { stdout: 'pipe' });
      const reader = grpcProc.stdout.getReader();
      let text = '';
      while (!text.includes('\n')) text += new TextDecoder().decode((await reader.read()).value);
      const port = /READY (\d+)/.exec(text)![1];
      grpcClient = new grpc.Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
      return (inputs) => perCall(inputs, grpcCall);
    },
  },
  {
    name: 'ts + remote gRPC runner, 1 call per decision',
    n: 2_000,
    setup: async () => grpcCall,
    teardown: () => {
      grpcClient?.close();
      grpcProc?.kill();
    },
  },
];

// --- micro benchmarks of kernel builtins ------------------------------------

function micro(sits: Situation[]) {
  const hands = sits.flatMap((s) => s.players.map((p) => p.counts));
  for (const h of hands.slice(0, 5000)) waits(h); // warmup
  const per = [];
  for (let r = 0; r < REPS; r++) {
    const t0 = Bun.nanoseconds();
    for (const h of hands) waits(h);
    per.push(hands.length / ((Bun.nanoseconds() - t0) / 1e9));
  }
  const rng = createRng(1);
  for (let i = 0; i < 2000; i++) buildWall(rng);
  const walls = [];
  for (let r = 0; r < REPS; r++) {
    const t0 = Bun.nanoseconds();
    for (let i = 0; i < 100_000; i++) buildWall(rng);
    walls.push(100_000 / ((Bun.nanoseconds() - t0) / 1e9));
  }
  return { waitsPerSec: median(per), wallsPerSec: median(walls) };
}

// --- main -------------------------------------------------------------------

const sits = generateSituations(createRng(SEED), TOTAL);

// Reference checksums for each prefix length, from the native rule.
const reference = new Map<number, number>();
for (const n of new Set(variants.map((v) => v.n))) {
  reference.set(n, (await runPass((xs) => xs.map(nativeEvaluate), sits, n)).checksum);
}

const results = [];
for (const v of variants) {
  const r = await measure(v, sits);
  const expected = v.name.startsWith('core-only') ? undefined : reference.get(v.n);
  const ok = expected === undefined || expected === r.checksum;
  results.push({ ...r, checksumOk: ok });
  console.error(
    `${v.name.padEnd(58)} ${r.decisionsPerSec.toFixed(0).padStart(9)}/s  p50 ${r.p50us.toFixed(1).padStart(8)}us  p99 ${r.p99us.toFixed(1).padStart(8)}us  checksum ${r.checksum}${ok ? '' : ' MISMATCH'}`,
  );
}

const out = {
  language: 'ts',
  runtime: `bun ${Bun.version}`,
  seed: SEED,
  reference: Object.fromEntries(reference),
  micro: micro(sits),
  results,
};
await Bun.write(new URL('../../results/ts.json', import.meta.url), JSON.stringify(out, null, 2));
console.error('micro', out.micro);
process.exit(results.every((r) => r.checksumOk) ? 0 : 1);
