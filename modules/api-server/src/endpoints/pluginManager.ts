import { MahjongCodeStorageV1, unaryCall } from 'proto';
import { storageServiceClient } from '../handler/storage';
import {
  ResourceType,
  StorageServiceClient,
} from 'proto/src/generated/services/storage';
import { NumberToResourceSource, ResourceSource } from 'utils';

const GET = async (req: Request) => {
  const { methodInfo } = (await req.json()) as {
    methodInfo: {
      name: string;
    };
  };
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
        defaultStore: dataReponsse.dependencies
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
