import type { HintOrigin } from '@internal/family-sql/control';
import type { SqlSchemaIR } from '@internal/sql-schema-ir/types';

/** What a SQLite schema contains, as hint resolution asks it. SQLite has one namespace. */
export function sqliteHintOrigin(schema: SqlSchemaIR): HintOrigin {
  return {
    hasTable: (_namespaceId, table) => Object.hasOwn(schema.tables, table),
    hasColumn: (_namespaceId, table, column) =>
      Object.hasOwn(schema.tables[table]?.columns ?? {}, column),
  };
}
