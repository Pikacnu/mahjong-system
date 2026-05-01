import { MahjongCodeStorageV1, MahjongRunnerV1, unaryCall } from 'proto';
import {
  ResourceSource,
  ResourceType,
} from 'proto/src/generated/services/storage';
import { storageServiceClient } from '../handler/storage';
import { runnerServiceClient } from '../handler/runner';
import { encodeToBytes, decodeFromBytes } from 'utils';

type RunnerPayload = {
  methodInfo?: {
    name?: string;
    version?: number;
  };
  code?: string;
  payload?: {
    thisValue?: unknown;
    args?: unknown[];
  };
  dependencies?: Array<{
    name: string;
    version: number;
  }>;
};

function decodeResult(buffer: Buffer) {
  const text = new TextDecoder().decode(buffer);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const GET = async () => {
  return Response.json(
    {
      message: 'Temp runner endpoint',
      usage: {
        method: 'POST',
        body: {
          methodInfo: { name: 'demo-entry', version: 1 },
          code: 'export function entry(context) { return { ok: true, context }; }',
          payload: {
            thisValue: { seed: 1 },
            args: [{ message: 'hello' }],
          },
        },
      },
    },
    { status: 200 },
  );
};

export const POST = async (request: Request) => {
  const body = (await request.json()) as RunnerPayload;
  const methodInfo = body.methodInfo;

  if (!methodInfo?.name || Number.isNaN(Number(methodInfo.version))) {
    return Response.json(
      { message: 'methodInfo.name and methodInfo.version are required' },
      { status: 400 },
    );
  }

  const normalizedMethodInfo = {
    name: methodInfo.name,
    version: Number(methodInfo.version),
  };

  if (body.code && body.code.trim()) {
    try {
      await unaryCall(
        storageServiceClient.storeResources.bind(storageServiceClient),
        {
          methodInfo: normalizedMethodInfo,
          data: body.code,
          resourceType: ResourceType.MODULE,
          sourceType: ResourceSource.USER,
          dependencies: body.dependencies || [],
        } as MahjongCodeStorageV1.StoreResourcesRequest,
      );
    } catch (e) {
      const msg = String(e ?? '');
      if (!msg.includes('already exists')) {
        throw e;
      }
      // ignore already-exists errors for demo smoke tests
    }
  }

  try {
    const runnerResult = await unaryCall(
      runnerServiceClient.runFunction.bind(runnerServiceClient),
      {
        functionInfo: normalizedMethodInfo,
        payload: {
          this: encodeToBytes(body.payload?.thisValue ?? null),
          args: (body.payload?.args || []).map((arg) => encodeToBytes(arg)),
        },
      } as MahjongRunnerV1.FunctionRequest,
    );
    let resultData = null;
    let resultBase64 = null;
    if (runnerResult && runnerResult.result) {
      try {
        const resultBuffer = runnerResult.result;
        resultData = decodeFromBytes(resultBuffer);

        resultBase64 = Buffer.from(resultBuffer).toString('base64');
      } catch (e) {
        // ignore decoding errors, result will be null
      }
    }

    return Response.json(
      {
        methodInfo: normalizedMethodInfo,
        storedCode: Boolean(body.code?.trim()),
        result: resultData,
        rawResultBase64: resultBase64,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error('Runner execution failed:', e);
    return Response.json(
      {
        message: 'Runner execution failed',
        error: String(e),
      },
      { status: 500 },
    );
  }
};

export const runnerHandler = { GET, POST };
