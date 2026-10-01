import type { Contract } from '@internal/contract/types';
import type { HintOrigin } from '@internal/family-sql/control';
import type { SqlStorage } from '@internal/sql-contract/types';
import type { PostgresDatabaseSchemaNode } from '../schema-ir/postgres-database-schema-node';
import { resolveDdlSchemaForNamespaceStorage } from './resolve-ddl-schema';

/** What a Postgres schema contains, as hint resolution asks it, by the contract's namespace ids. */
export function postgresHintOrigin(
  schema: PostgresDatabaseSchemaNode,
  contract: Contract<SqlStorage>,
): HintOrigin {
  const tableIn = (namespaceId: string, table: string) =>
    schema.namespaces[resolveDdlSchemaForNamespaceStorage(contract.storage, namespaceId)]?.tables[
      table
    ];
  return {
    hasTable: (namespaceId, table) => tableIn(namespaceId, table) !== undefined,
    hasColumn: (namespaceId, table, column) =>
      Object.hasOwn(tableIn(namespaceId, table)?.columns ?? {}, column),
  };
}
