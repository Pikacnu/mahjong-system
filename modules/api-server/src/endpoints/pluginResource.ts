import { unaryCall } from 'proto';
import { storageServiceClient } from '../handler/storage';
import {
  ResourceSource,
  ResourceType,
} from 'proto/src/generated/services/storage';
import { validateCode } from '../utils/valid';
import {
  pluginResourcePostSchema,
  pluginResourceGetSchema,
  handleValidationError,
} from '../utils/schemas';

export const POST = async (req: Request) => {
  const body = await req.json();
  const validation = pluginResourcePostSchema.safeParse(body);

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { methodInfo, resourceType, data, dependencies } = validation.data;

  const [isValid, message, parseResult] = validateCode(data);
  if (!isValid) {
    return Response.json(
      {
        message: 'Code validation failed: ' + message,
      },
      {
        status: 400,
      },
    );
  }

  const codeDependencies = parseResult.body
    .filter((statement) => statement.type === 'ImportDeclaration')
    .map((importStatement) => {
      const name = importStatement.source.value;
      if (typeof name !== 'string') {
        throw new Error('Invalid import statement: ' + name);
      }
      return {
        name,
        version: -1,
      };
    })
    .filter((dep) => dep.name)
    .filter((dep) => {
      return dep.name.startsWith('./') || dep.name.startsWith('../');
    });

  const requestDependenciesSet = new Set(dependencies.map((dep) => dep.name));

  const requestMissingDeps = codeDependencies.filter((dep) => {
    return dep.name && !requestDependenciesSet.has(dep.name);
  });

  if (requestMissingDeps.length > 0) {
    console.warn(
      'The following dependencies are required by the code but not provided in the request body: ' +
        requestMissingDeps.map((dep) => dep.name).join(', '),
    );
  }

  // It is able to use Dep Auto Fill when
  // remove this check and let storage services to handle
  // if (requestMissingDeps.length > 0) {
  //   return Response.json(
  //     {
  //       message:
  //         'Missing dependencies in request body: ' +
  //         requestMissingDeps.map((dep) => dep.name).join(', '),
  //     },
  //     {
  //       status: 400,
  //     },
  //   );
  // }

  try {
    const storeResult = await unaryCall(
      storageServiceClient.storeResources.bind(storageServiceClient),
      {
        methodInfo,
        data,
        resourceType,
        sourceType: ResourceSource.USER,
        dependencies: [...dependencies, ...codeDependencies],
      },
    );
    console.log('storeResult : ', storeResult);
    return Response.json(
      {
        message: 'Resource data stored successfully',
      },
      {
        status: 200,
      },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Failed to store resource data',
      },
      {
        status: 500,
      },
    );
  }
};

export const GET = async (req: Request) => {
  const searchParams = new URL(req.url).searchParams;
  const name = searchParams.get('name');
  const versionStr = searchParams.get('version');
  const resourceTypeStr = searchParams.get('resourceType');

  const validation = pluginResourceGetSchema.safeParse({
    name,
    version: versionStr ? Number(versionStr) : undefined,
    resourceType: resourceTypeStr ? Number(resourceTypeStr) : undefined,
  });

  if (!validation.success) {
    return Response.json(handleValidationError(validation.error), {
      status: 400,
    });
  }

  const { name: validName, version, resourceType } = validation.data;

  try {
    const response = await unaryCall(
      storageServiceClient.getResourcesData.bind(storageServiceClient),
      {
        methodInfo: {
          name: validName,
          version,
        },
        resourceType,
      },
    );
    console.log('get resource response : ', response);
    if (!response.code) {
      return Response.json(
        {
          message: 'Resource not found',
        },
        {
          status: 404,
        },
      );
    }
    return Response.json(
      {
        code: response.code,
        hash: response.hash,
      },
      {
        status: 200,
      },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        message: 'Failed to get resource data',
      },
      {
        status: 500,
      },
    );
  }
};

export const pluginResourceHandler = {
  GET,
  POST,
};
