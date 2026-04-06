import { Metadata, Server } from '@grpc/grpc-js';
import { Status } from '@grpc/grpc-js/build/src/constants';
import { MahjongCodeStorageV1, MahjongCommonV1 } from 'proto';
import { ErrorCode } from 'proto/src/generated/common';
import { db } from '../utils/db';
import {
  method,
  resource,
  versions,
  builtinType,
  sourceType,
} from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { dependencies } from './../../db/schema';

async function getMethodInfo(
  name: string,
  source_type?: (typeof sourceType.enumValues)[number],
) {
  return await db
    .select()
    .from(method)
    .where(
      source_type
        ? and(eq(method.name, name), eq(method.sourceType, source_type))
        : eq(method.name, name),
    )
    .limit(1)
    .then((res) => res[0]);
}

const ResourceTypeRPCMap: {
  [key in MahjongCodeStorageV1.ResourceType]: (typeof builtinType.enumValues)[number];
} = {
  [MahjongCodeStorageV1.ResourceType.FUNCTION]: 'function',
  [MahjongCodeStorageV1.ResourceType.MODULE]: 'modules',
  [MahjongCodeStorageV1.ResourceType.UNRECOGNIZED]: 'function', // default to function for unknown type
};

const SourceTypeRPCMap: {
  [key in MahjongCodeStorageV1.ResourceSource]: (typeof sourceType.enumValues)[number];
} = {
  [MahjongCodeStorageV1.ResourceSource.BUILTIN]: 'builtin',
  [MahjongCodeStorageV1.ResourceSource.USER]: 'user',
  [MahjongCodeStorageV1.ResourceSource.UNRECOGNIZED]: 'user',
};

export function createGrpcServer(): Server {
  const server = new Server();
  server.addService(MahjongCodeStorageV1.StorageServiceService, {
    getMethodInfo: async (call, callback) => {
      const { methodInfo, resourceSource } = call.request;
      if (!methodInfo) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          details: 'Missing method in request',
        });
      }
      const methodData = await getMethodInfo(
        methodInfo.name,
        resourceSource ? SourceTypeRPCMap[resourceSource] : undefined,
      );
      if (!methodData) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No method found with name ${methodInfo.name}`,
        });
      }
      const { versionId, methodId } =
        (await db
          .select({ versionId: versions.id, methodId: versions.methodId })
          .from(versions)
          .where(
            and(
              eq(versions.methodId, methodData.id),
              eq(versions.version, methodInfo.version),
            ),
          )
          .limit(1)
          .then((res) => res[0])) || {};
      if (!versionId || !methodId) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No version ${methodInfo.version} found for method ${methodInfo.name}`,
        });
      }
      const dependenciesData = (
        await db
          .select({ name: method.name, version: versions.version })
          .from(dependencies)
          .where(eq(dependencies.dependencyVersionId, versionId))
          .leftJoin(method, eq(method.id, methodId))
      ).filter((data) => !!data.name && !!data.version) as {
        name: string;
        version: number;
      }[];
      callback(null, {
        dependencies: dependenciesData,
      });
    },
    getResourcesVersions: async (call, callback) => {
      const { functionName } = call.request;
      if (!functionName) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          details: 'Missing functionName in request',
        });
      }
      const methodInfo = await getMethodInfo(functionName);
      if (!methodInfo) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No method found with name ${functionName}`,
        });
      }
      const versionData = await db
        .select({
          version: versions.version,
        })
        .from(versions)
        .where(eq(versions.methodId, methodInfo.id));
      if (!versionData || versionData.length === 0) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No versions found for method ${functionName}`,
        });
      }
      callback(null, {
        versions: versionData.map((v) => v.version),
      });
    },
    getResourcesData: async (call, callback) => {
      const { methodInfo } = call.request;
      if (!methodInfo) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          details: 'Missing method in request',
        });
      }
      const methodData = await getMethodInfo(methodInfo.name);
      if (!methodData) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No method found with name ${methodInfo.name}`,
        });
      }
      const codeData = await db
        .select({
          code: resource.code,
          hash: resource.hash,
        })
        .from(versions)
        .where(eq(versions.methodId, methodData.id))
        .leftJoin(resource, eq(versions.resourceId, resource.id))
        .limit(1)
        .then((res) => res[0]);
      if (!codeData || !codeData.code || !codeData.hash) {
        return callback({
          code: Status.NOT_FOUND,
          details: `No code found for method ${methodInfo.name} version ${methodInfo.version}`,
        });
      }
      const hashBuffer = Buffer.alloc(8);
      hashBuffer.writeBigInt64BE(codeData.hash);
      callback(null, {
        code: codeData.code,
        hash: hashBuffer,
      });
    },
    storeResources: async (call, callback) => {
      const { methodInfo, data, sourceType, resourceType, dependencies } =
        call.request;

      if (!methodInfo || !data || !sourceType || !resourceType) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          details:
            'Missing methodInfo, data, sourceType, or resourceType in request',
        });
      }

      if (!dependencies) {
        return callback({
          code: Status.INVALID_ARGUMENT,
          details: 'Missing dependencies in request',
        });
      }

      await db
        .transaction(async (tx) => {
          let methodData = await tx
            .select()
            .from(method)
            .where(eq(method.name, methodInfo.name))
            .limit(1)
            .then((res) => res[0]);
          if (!methodData) {
            methodData = await tx
              .insert(method)
              .values({
                name: methodInfo.name,
                sourceType: SourceTypeRPCMap[sourceType],
              })
              .onConflictDoNothing()
              .returning()
              .then((res) => res[0]);
          }
          const versionData = await tx
            .select()
            .from(versions)
            .where(
              and(
                eq(versions.methodId, methodData!.id),
                eq(versions.version, methodInfo.version),
              ),
            )
            .limit(1)
            .then((res) => res[0]);
          if (versionData) {
            throw new Error(
              `Version ${methodInfo.version} for method ${methodInfo.name} already exists`,
            );
          }
          const hash = Bun.hash(data);
          const resourceData = await tx
            .insert(resource)
            .values({
              code: data,
              hash: BigInt(hash),
            })
            .returning()
            .then((res) => res[0]);

          if (!resourceData) {
            throw new Error('Failed to insert resource');
          }

          const resourceId = resourceData.id;

          await tx.insert(versions).values({
            version: methodInfo.version,
            methodId: methodData!.id,
            resourceId,
            resourceType: ResourceTypeRPCMap[resourceType],
            sourceType: SourceTypeRPCMap[sourceType],
          });

          dependencies.forEach(async (dep) => {
            const depMethodData = await tx
              .select()
              .from(method)
              .where(eq(method.name, dep))
              .limit(1)
              .then((res) => res[0]);
            if (!depMethodData) {
              throw new Error(`Dependency method ${dep} not found`);
            }
            await tx.insert(versions).values({
              version: methodInfo.version,
              methodId: depMethodData.id,
              resourceId,
              resourceType: ResourceTypeRPCMap[resourceType],
              sourceType: SourceTypeRPCMap[sourceType],
            });
          });

          callback(null, {});
        })
        .catch((error) => {
          callback(
            {
              code: Status.INTERNAL,
              details: error instanceof Error ? error.message : String(error),
            },
            null,
          );
        });
    },
  } as MahjongCodeStorageV1.StorageServiceServer);
  return server;
}
