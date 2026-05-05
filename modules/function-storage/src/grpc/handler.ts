import { Server } from '@grpc/grpc-js';
import { MahjongCodeStorageV1 } from 'proto';
import { ErrorCode } from 'proto/src/generated/common';
import { db } from '../utils/db';
import {
  method,
  resource,
  versions,
  builtinType,
  sourceType,
  pluginDefinitions,
} from '../../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { dependencies as depsSchema } from './../../db/schema';
import { Empty } from 'proto/src/generated/google/protobuf/empty';

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

async function getVersionInfoByMethod(
  methodId: number,
  version: number,
  source_type?: (typeof sourceType.enumValues)[number],
) {
  return await db
    .select({
      id: versions.id,
      methodId: versions.methodId,
      version: versions.version,
      resourceId: versions.resourceId,
    })
    .from(versions)
    .where(
      source_type
        ? and(eq(versions.methodId, methodId), eq(versions.version, version))
        : and(eq(versions.methodId, methodId), eq(versions.version, version)),
    )
    .limit(1)
    .then((res) => res[0]);
}

async function getDependenciesByVersionId(versionId: number) {
  return await db
    .select({ name: method.name, version: versions.version })
    .from(depsSchema)
    .where(eq(depsSchema.sourceVersionId, versionId))
    .leftJoin(versions, eq(versions.id, depsSchema.dependencyVersionId))
    .leftJoin(method, eq(method.id, versions.methodId))
    .then(
      (rows) =>
        rows.filter((row) => row.name && row.version) as {
          name: string;
          version: number;
        }[],
    );
}

const ResourceTypeRPCMap: {
  [key in MahjongCodeStorageV1.ResourceType]: (typeof builtinType.enumValues)[number];
} = {
  [MahjongCodeStorageV1.ResourceType.FUNCTION]: 'function',
  [MahjongCodeStorageV1.ResourceType.MODULE]: 'modules',
  [MahjongCodeStorageV1.ResourceType.UNRECOGNIZED]: 'function',
};

const SourceTypeRPCMap: {
  [key in MahjongCodeStorageV1.ResourceSource]: (typeof sourceType.enumValues)[number];
} = {
  [MahjongCodeStorageV1.ResourceSource.BUILTIN]: 'builtin',
  [MahjongCodeStorageV1.ResourceSource.USER]: 'user',
  [MahjongCodeStorageV1.ResourceSource.UNRECOGNIZED]: 'user',
};

function createError(code: ErrorCode, message: string) {
  return { success: false, error: { code, message } };
}

export function createGrpcServer(): Server {
  const server = new Server();
  server.addService(MahjongCodeStorageV1.StorageServiceService, {
    getMethodInfo: async (call, callback) => {
      const { methodInfo, resourceSource } = call.request;
      if (!methodInfo) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing methodInfo in request',
          ),
        );
      }
      const methodData = await getMethodInfo(
        methodInfo.name,
        resourceSource !== undefined
          ? SourceTypeRPCMap[resourceSource]
          : undefined,
      );
      if (!methodData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No method found with name ${methodInfo.name}`,
          ),
        );
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
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No version ${methodInfo.version} found for method ${methodInfo.name}`,
          ),
        );
      }
      const dependenciesData = await getDependenciesByVersionId(versionId);
      callback(null, {
        success: true,
        data: { dependencies: dependenciesData },
      });
    },

    getPluginDefinition: async (call, callback) => {
      const { methodInfo, resourceSource } = call.request;
      if (!methodInfo) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing methodInfo in request',
          ),
        );
      }

      const methodData = await getMethodInfo(
        methodInfo.name,
        resourceSource !== undefined
          ? SourceTypeRPCMap[resourceSource]
          : undefined,
      );

      if (!methodData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No method found with name ${methodInfo.name}`,
          ),
        );
      }

      const versionData = await getVersionInfoByMethod(
        methodData.id,
        methodInfo.version,
        resourceSource !== undefined
          ? SourceTypeRPCMap[resourceSource]
          : undefined,
      );

      if (!versionData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No version ${methodInfo.version} found for method ${methodInfo.name}`,
          ),
        );
      }

      const definition = await db
        .select({
          defaultStore: pluginDefinitions.defaultStore,
        })
        .from(pluginDefinitions)
        .where(eq(pluginDefinitions.versionId, versionData.id))
        .limit(1)
        .then((res) => res[0]);

      if (!definition) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No plugin definition found for ${methodInfo.name}@${methodInfo.version}`,
          ),
        );
      }

      const dependenciesData = await getDependenciesByVersionId(versionData.id);

      callback(null, {
        success: true,
        data: {
          defaultStore: JSON.parse(definition.defaultStore),
          dependencies: dependenciesData,
        },
      });
    },

    getResourcesVersions: async (call, callback) => {
      const { functionName, resourceType, resourceSource } = call.request;
      if (!functionName) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing functionName in request',
          ),
        );
      }
      const methodInfo = await getMethodInfo(
        functionName,
        resourceSource !== undefined
          ? SourceTypeRPCMap[resourceSource]
          : undefined,
      );
      if (!methodInfo) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No method found with name ${functionName}`,
          ),
        );
      }
      const versionsData = await db
        .select({ version: versions.version })
        .from(versions)
        .where(eq(versions.methodId, methodInfo.id))
        .orderBy(desc(versions.version));

      callback(null, {
        success: true,
        data: {
          versions: versionsData.map((v) => v.version),
        },
      });
    },

    getResourcesData: async (call, callback) => {
      const { methodInfo } = call.request;
      if (!methodInfo) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing methodInfo in request',
          ),
        );
      }
      const methodData = await getMethodInfo(methodInfo.name);
      if (!methodData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No method found with name ${methodInfo.name}`,
          ),
        );
      }
      const versionData = await getVersionInfoByMethod(
        methodData.id,
        methodInfo.version,
      );
      if (!versionData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No version ${methodInfo.version} found for method ${methodInfo.name}`,
          ),
        );
      }

      const resourceData = await db
        .select({ code: resource.code, hash: resource.hash })
        .from(resource)
        .where(eq(resource.id, versionData.resourceId))
        .limit(1)
        .then((res) => res[0]);

      if (!resourceData) {
        return callback(
          null,
          createError(ErrorCode.NOT_FOUND, `No resource data found`),
        );
      }

      callback(null, {
        success: true,
        data: {
          code: resourceData.code,
          hash: Buffer.from(resourceData.hash, 'hex'),
        },
      });
    },

    storeResources: async (call, callback) => {
      const {
        methodInfo,
        data,
        resourceType,
        sourceType: rpcSourceType,
        dependencies,
      } = call.request;

      if (
        methodInfo === undefined ||
        data === undefined ||
        rpcSourceType === undefined ||
        resourceType === undefined
      ) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing methodInfo, data, sourceType, or resourceType in request',
          ),
        );
      }

      if (!dependencies || !Array.isArray(dependencies)) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing dependencies in request',
          ),
        );
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
                sourceType: SourceTypeRPCMap[rpcSourceType],
              })
              .onConflictDoNothing()
              .returning()
              .then((res) => res[0]);
          }

          const existingVersion = await tx
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
          if (existingVersion) {
            throw new Error(
              `Version ${methodInfo.version} for method ${methodInfo.name} already exists`,
            );
          }

          // compute hash using Bun.hash (returns BigInt)
          const hash = Bun.hash(data);
          const hashStr = String(hash);

          // insert or lookup resource by hash (store hash as text to avoid overflow)
          let resourceData = await tx
            .insert(resource)
            .values({
              code: data,
              hash: hashStr,
            })
            .returning()
            .then((res) => res[0]);

          if (!resourceData) {
            resourceData = await tx
              .select()
              .from(resource)
              .where(eq(resource.hash, hashStr))
              .limit(1)
              .then((res) => res[0]);
          }

          if (!resourceData) {
            throw new Error('Failed to insert or lookup resource');
          }

          const resourceId = resourceData.id;

          const insertedVersion = await tx
            .insert(versions)
            .values({
              version: methodInfo.version,
              methodId: methodData!.id,
              resourceId,
              resourceType: ResourceTypeRPCMap[resourceType],
            })
            .returning()
            .then((res) => res[0]);

          if (!insertedVersion) {
            throw new Error('Failed to insert version');
          }

          // for each dependency, resolve a concrete versions.id and insert hard-pin
          for (const dep of dependencies) {
            if (!dep || !dep.name) throw new Error('Invalid dependency entry');

            const depMethod = await tx
              .select()
              .from(method)
              .where(eq(method.name, dep.name))
              .limit(1)
              .then((res) => res[0]);

            if (!depMethod) {
              throw new Error(`Dependency method ${dep.name} not found`);
            }

            let dependencyVersionRow;
            if (dep.version === -1 || dep.version === undefined) {
              dependencyVersionRow = await tx
                .select({ id: versions.id, version: versions.version })
                .from(versions)
                .where(eq(versions.methodId, depMethod.id))
                .orderBy(desc(versions.version))
                .limit(1)
                .then((res) => res[0]);
              if (!dependencyVersionRow)
                throw new Error(`No versions found for dependency ${dep.name}`);
            } else if (typeof dep.version === 'number') {
              dependencyVersionRow = await tx
                .select({ id: versions.id, version: versions.version })
                .from(versions)
                .where(
                  and(
                    eq(versions.methodId, depMethod.id),
                    eq(versions.version, dep.version),
                  ),
                )
                .limit(1)
                .then((res) => res[0]);
              if (!dependencyVersionRow)
                throw new Error(
                  `Dependency ${dep.name}@${dep.version} not found`,
                );
            } else {
              throw new Error(
                'Semantic version constraints not supported; use numeric version or -1 for latest',
              );
            }

            await tx
              .insert(depsSchema)
              .values({
                sourceVersionId: insertedVersion.id,
                dependencyVersionId: dependencyVersionRow.id,
              })
              .onConflictDoNothing();
          }

          callback(null, { success: true, data: Empty.create() });
        })
        .catch((error) => {
          callback(
            null,
            createError(
              ErrorCode.INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error),
            ),
          );
        });
    },

    storePluginDefinition: async (call, callback) => {
      const { methodInfo, defaultStore, sourceType } = call.request;

      if (!methodInfo) {
        return callback(
          null,
          createError(
            ErrorCode.INVALID_ARGUMENT,
            'Missing methodInfo in request',
          ),
        );
      }

      const methodData = await getMethodInfo(
        methodInfo.name,
        sourceType !== undefined ? SourceTypeRPCMap[sourceType] : undefined,
      );

      if (!methodData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No method found with name ${methodInfo.name}`,
          ),
        );
      }

      const versionData = await getVersionInfoByMethod(
        methodData.id,
        methodInfo.version,
        sourceType !== undefined ? SourceTypeRPCMap[sourceType] : undefined,
      );

      if (!versionData) {
        return callback(
          null,
          createError(
            ErrorCode.NOT_FOUND,
            `No version ${methodInfo.version} found for method ${methodInfo.name}`,
          ),
        );
      }

      const defaultStoreText =
        typeof defaultStore === 'string'
          ? defaultStore
          : JSON.stringify(defaultStore ?? {});

      await db
        .insert(pluginDefinitions)
        .values({
          versionId: versionData.id,
          defaultStore: defaultStoreText,
        })
        .onConflictDoUpdate({
          target: pluginDefinitions.versionId,
          set: {
            defaultStore: defaultStoreText,
            updatedAt: new Date(),
          },
        })
        .then(() => callback(null, { success: true, data: Empty.create() }))
        .catch((error) => {
          callback(
            null,
            createError(
              ErrorCode.INTERNAL_ERROR,
              error instanceof Error ? error.message : String(error),
            ),
          );
        });
    },
  } as MahjongCodeStorageV1.StorageServiceServer);

  return server;
}
