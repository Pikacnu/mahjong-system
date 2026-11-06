import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const protoRoot = join(import.meta.dir, '..');
const pluginName = process.platform === 'win32' ? 'protoc-gen-ts_proto.exe' : 'protoc-gen-ts_proto';
const plugin = join(protoRoot, 'node_modules', '.bin', pluginName);
const servicesDir = join(protoRoot, 'src', 'proto', 'services');
const outDir = join(protoRoot, 'src', 'generated');

mkdirSync(outDir, { recursive: true });

const protoFiles = readdirSync(servicesDir)
  .filter((file) => file.endsWith('.proto'))
  .map((file) => join(servicesDir, file));

const proc = Bun.spawn(
  [
    'protoc',
    `--plugin=protoc-gen-ts_proto=${plugin}`,
    `--proto_path=${join(protoRoot, 'src', 'proto')}`,
    `--ts_proto_out=${outDir}`,
    '--ts_proto_opt=esModuleInterop=true,env=node,outputServices=grpc-js,useOptionals=messages',
    ...protoFiles,
  ],
  { cwd: protoRoot, stdout: 'inherit', stderr: 'inherit' },
);

process.exit(await proc.exited);
