import { MahjongCodeStorageV1, MahjongRunnerV1, unaryCall } from 'proto';
import {
  ResourceSource,
  ResourceType,
} from 'proto/src/generated/services/storage';
import { storageServiceClient } from '../handler/storage';
import { runnerServiceClient } from '../handler/runner';
import { encodeToBytes, decodeFromBytes } from 'utils';
import { runnerPayloadSchema, handleValidationError } from '../utils/schemas';

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
  const body = await request.json();
  const validation = runnerPayloadSchema.safeParse(body);

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { methodInfo, code, payload, dependencies } = validation.data;

  if (!methodInfo?.name) {
    return Response.json(
      { message: 'methodInfo.name is required' },
      { status: 400 },
    );
  }

  const normalizedMethodInfo = {
    name: methodInfo.name,
    version: methodInfo.version ?? 0,
  };

  if (code && code.trim()) {
    try {
      await unaryCall(
        storageServiceClient.storeResources.bind(storageServiceClient),
        {
          methodInfo: normalizedMethodInfo,
          data: code,
          resourceType: ResourceType.MODULE,
          sourceType: ResourceSource.USER,
          dependencies: dependencies || [],
        } as MahjongCodeStorageV1.StoreResourcesRequest,
      );
    } catch (e) {
      const msg = String(e ?? '');
      if (!msg.includes('already exists')) {
        console.error('Failed to store code resource:', e);
        return Response.json(
          {
            message: 'Failed to store code resource',
            error: msg,
          },
          { status: 500 },
        );
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
          this: encodeToBytes(payload?.thisValue ?? null),
          args: (payload?.args || []).map((arg) => encodeToBytes(arg)),
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
        storedCode: Boolean(code?.trim()),
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
