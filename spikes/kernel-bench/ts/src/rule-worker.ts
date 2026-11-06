// Hosts rule.js natively (JIT) in a Bun Worker. Messages: { id, inputs[] } -> { id, outputs[] }.
const src = await Bun.file(new URL('./rule.js', import.meta.url)).text();
const evaluate = new Function(`${src}\nreturn evaluate;`)() as (x: unknown) => unknown;

self.onmessage = (event: MessageEvent) => {
  const { id, inputs } = event.data as { id: number; inputs: unknown[] };
  postMessage({ id, outputs: inputs.map(evaluate) });
};

postMessage({ id: -1, outputs: [] });
