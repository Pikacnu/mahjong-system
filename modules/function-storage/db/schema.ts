import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  pgSchema,
  index,
  uniqueIndex,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';

export const schema = pgSchema('function_storage');
export const builtinType = schema.enum('builtinMethodsType', [
  'function',
  'modules',
]);

export const sourceType = schema.enum('sourceType', ['builtin', 'user']);

export const resource = schema.table(
  'resource',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: text('code').notNull(),
    hash: text('hash').notNull(),
  },
  (table) => {
    return [index('idx_resource_hash').on(table.hash)];
  },
);

export const method = schema.table('method', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  sourceType: sourceType('source_type').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const versions = schema.table(
  'versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    version: integer('version').notNull(),
    methodId: integer('method_id')
      .notNull()
      .references(() => method.id),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resource.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resourceType: builtinType('resource_type').notNull(),
  },
  (table) => {
    return [
      index('idx_versions_method_id').on(table.methodId),
      // composite index to help resolve latest version for a method
      index('idx_versions_method_version').on(table.methodId, table.version),
      index('idx_versions_resource_id').on(table.resourceId),
      uniqueIndex('uq_versions_method_version_type').on(
        table.methodId,
        table.version,
      ),
    ];
  },
);

export const dependencies = schema.table(
  'dependencies',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    sourceVersionId: integer('source_version_id')
      .notNull()
      .references(() => versions.id),
    dependencyVersionId: integer('dependency_version_id')
      .notNull()
      .references(() => versions.id),
  },
  (table) => {
    return [
      index('idx_dependencies_source_version_id').on(table.sourceVersionId),
      index('idx_dependencies_dependency_version_id').on(
        table.dependencyVersionId,
      ),
      uniqueIndex('uq_dependencies_source_dependency_version').on(
        table.sourceVersionId,
        table.dependencyVersionId,
      ),
    ];
  },
);

export const pluginDefinitions = schema.table(
  'plugin_definitions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    versionId: integer('version_id')
      .notNull()
      .references(() => versions.id),
    // Stored as JSON string to keep payload format-agnostic.
    defaultStore: text('default_store').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => {
    return [
      uniqueIndex('uq_plugin_definitions_version_id').on(table.versionId),
      index('idx_plugin_definitions_version_id').on(table.versionId),
    ];
  },
);
