import { MahjongCodeStorageV1, unaryCall } from 'proto';
import { storageServiceClient } from '../handler/storage';
import {
  ResourceType,
  StorageServiceClient,
} from 'proto/src/generated/services/storage';
import { ResourceSource } from 'utils';

async function readMethodInfo(req: Request) {
  const url = new URL(req.url);
  const queryName = url.searchParams.get('name');
  const queryVersion = url.searchParams.get('version');

  if (queryName) {
    return {
      methodInfo: {
        name: queryName,
        version: queryVersion ? Number(queryVersion) : 0,
      },
    };
  }

  try {
    const body = (await req.json()) as {
      methodInfo?: {
        name?: string;
        version?: number;
      };
    };

    if (body?.methodInfo?.name) {
      return {
        methodInfo: {
          name: body.methodInfo.name,
          version: body.methodInfo.version ?? 0,
        },
      };
    }
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
        defaultStore: dataReponsse.defaultStore
          ? JSON.parse(new TextDecoder().decode(dataReponsse.defaultStore))
          : null,
        dependencies: dataReponsse.dependencies,
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
  return pluginDataReponsse.dependencies !== null;
}

const POST = async (req: Request) => {
  const { methodInfo, defaultStore } = (await req.json()) as {
    methodInfo: {
      name: string;
      version: number;
    };
    defaultStore?: Record<string, unknown>;
  };

  if (!methodInfo || !methodInfo.name) {
    return Response.json(
      {
        message: 'Invalid request body',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const storePluginCodeRespose = await unaryCall(
      storageServiceClient.storePluginDefinition.bind(storageServiceClient),
      {
        methodInfo,
        ...(defaultStore
          ? {
              defaultStore: new TextEncoder().encode(
                JSON.stringify(defaultStore),
              ) as Buffer,
            }
          : {}),
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
