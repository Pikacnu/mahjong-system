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
} from 'drizzle-orm/pg-core';

export const schema = pgSchema('function_storage');
export const builtinType = pgEnum('builtinMethodsType', [
  'function',
  'modules',
]);

export const sourceType = pgEnum('sourceType', ['builtin', 'user']);

export const resource = pgTable(
  'resource',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: text('code').notNull(),
    hash: bigint('hash', {
      mode: 'bigint',
    })
      .notNull()
      .unique(),
  },
  (table) => {
    return [index('idx_resource_hash').on(table.hash)];
  },
);

export const method = pgTable('method', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  sourceType: sourceType('source_type').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const versions = pgTable(
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
    sourceType: sourceType('source_type').notNull(),
  },
  (table) => {
    return [
      index('idx_versions_method_id').on(table.methodId),
      index('idx_versions_resource_id').on(table.resourceId),
      uniqueIndex('uq_versions_method_version_type').on(
        table.methodId,
        table.version,
      ),
    ];
  },
);

export const dependencies = pgTable(
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
