// Stand-in for a remote function-runner: a separate process serving rule.js over gRPC.
// Request/response bodies are JSON arrays of rule inputs/outputs.
import * as grpc from '@grpc/grpc-js';

export const ruleServiceDefinition = {
  evaluate: {
    path: '/bench.Rule/Evaluate',
    requestStream: false,
    responseStream: false,
    requestSerialize: (b: Buffer) => b,
    requestDeserialize: (b: Buffer) => b,
    responseSerialize: (b: Buffer) => b,
    responseDeserialize: (b: Buffer) => b,
  },
} satisfies grpc.ServiceDefinition;

if (import.meta.main) {
  const src = await Bun.file(new URL('./rule.js', import.meta.url)).text();
  const evaluate = new Function(`${src}\nreturn evaluate;`)() as (x: unknown) => unknown;

  const server = new grpc.Server();
  server.addService(ruleServiceDefinition, {
    evaluate: (
      call: grpc.ServerUnaryCall<Buffer, Buffer>,
      callback: grpc.sendUnaryData<Buffer>,
    ) => {
      const inputs = JSON.parse(call.request.toString('utf8')) as unknown[];
      callback(null, Buffer.from(JSON.stringify(inputs.map(evaluate)), 'utf8'));
    },
  });
  server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) throw err;
    console.log(`READY ${port}`);
  });
}
