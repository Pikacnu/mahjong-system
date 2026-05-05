import { MahjongCodeStorageV1, unaryCall } from 'proto';
import { HookCategory, HookMode } from 'proto/src/generated/services/storage';
import { storageServiceClient } from '../handler/storage';
import {
  methodInfoSchema,
  storePluginDefinitionSchema,
  handleValidationError,
} from '../utils/schemas';

async function readMethodInfo(req: Request) {
  const url = new URL(req.url);
  const queryName = url.searchParams.get('name');
  const queryVersion = url.searchParams.get('version');

  if (queryName) {
    const validation = methodInfoSchema.safeParse({
      name: queryName,
      version: queryVersion ? Number(queryVersion) : 0,
    });
    if (!validation.success) {
      return null;
    }
    return {
      methodInfo: validation.data,
    };
  }

  try {
    const body: unknown = await req.json();
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const bodyObj = body as Record<string, unknown>;
    const validation = methodInfoSchema.safeParse(bodyObj.methodInfo);
    if (!validation.success) {
      return null;
    }
    return {
      methodInfo: validation.data,
    };
  } catch {
    // Browsers typically do not send JSON bodies with GET requests.
  }

  return null;
}

const GET = async (req: Request) => {
  const requestMethodInfo = await readMethodInfo(req);
  if (!requestMethodInfo) {
    return Response.json(
      {
        message: 'Missing methodInfo',
      },
      {
        status: 400,
        statusText: 'Bad Request',
      },
    );
  }

  const { methodInfo } = requestMethodInfo;
  try {
    const dataReponsse = await unaryCall(
      storageServiceClient.getPluginDefinition.bind(storageServiceClient),
      {
        methodInfo: {
          ...methodInfo,
          version: 0, //placeholder, this won't be used to query
        },
      },
    );
    if (!dataReponsse) {
      return Response.json(
        {
          message: 'Plugin definition not found',
        },
        {
          status: 404,
          statusText: 'Not Found',
        },
      );
    }
    return Response.json(
      {
        methodInfo,
        defaultStore: dataReponsse.data?.defaultStore ?? null,
        hooks: (dataReponsse.data?.hooks ?? []).map((hook) => ({
          type: hook.type,
          category:
            hook.category === HookCategory.DECISION ? 'decision' : 'lifecycle',
          mode: hook.mode === HookMode.COMMAND ? 'command' : 'query',
        })),
        dependencies: dataReponsse.data?.dependencies,
      },
      {
        status: 200,
      },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Failed to get plugin definition',
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );
  }
};

async function isResourceExist(methodInfo: { name: string; version: number }) {
  const pluginDataReponsse = await unaryCall(
    storageServiceClient.getPluginDefinition.bind(storageServiceClient),
    {
      methodInfo,
    },
  );
  return pluginDataReponsse.data?.dependencies !== null;
}

const POST = async (req: Request) => {
  const body = await req.json();
  const validation = storePluginDefinitionSchema.safeParse(body);

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { methodInfo, defaultStore, hooks } = validation.data;

  try {
    const storePluginCodeRespose = await unaryCall(
      storageServiceClient.storePluginDefinition.bind(storageServiceClient),
      {
        methodInfo,
        defaultStore: defaultStore ?? {},
        hooks: hooks.map((hook) => ({
          type: hook.type,
          category:
            hook.category === 'decision'
              ? HookCategory.DECISION
              : HookCategory.LIFECYCLE,
          mode: hook.mode === 'command' ? HookMode.COMMAND : HookMode.QUERY,
        })),
        sourceType: 1,
      } as MahjongCodeStorageV1.StorePluginDefinitionRequest,
    );
    console.log('storePluginCodeRespose : ', storePluginCodeRespose);
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Failed to store plugin definition',
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
      },
    );
  }
  return Response.json(
    {
      message: 'Plugin definition stored successfully',
    },
    {
      status: 200,
      statusText: 'OK',
    },
  );
};

const DELETE = async (req: Request) => {
  const { methodInfo } = (await req.json()) as {
    methodInfo: {
      name: string;
      version: number;
    };
  };
  if (!(await isResourceExist(methodInfo))) {
    return Response.json(
      {
        message: 'Plugin definition not found',
      },
      {
        status: 404,
        statusText: 'Not Found',
      },
    );
  }
};

export const pluginHandler = {
  GET,
  POST,
  //DELETE,
};
