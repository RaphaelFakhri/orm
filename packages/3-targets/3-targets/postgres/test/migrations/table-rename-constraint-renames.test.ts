import { describe, expect, it } from 'vitest';
import { postgresContractToSchema } from '../../src/core/migrations/postgres-contract-to-schema';
import { constraintRenamesForTableRename } from '../../src/core/migrations/table-rename-constraint-renames';
import type { PostgresTableSchemaNode } from '../../src/core/schema-ir/postgres-table-schema-node';
import { contractOf, type ProfileSpec, reference } from './rename-table-fixtures';

function unrenamedTable(spec: ProfileSpec): PostgresTableSchemaNode {
  const schema = postgresContractToSchema(contractOf('UserProfile', spec, 'to'), []);
  const table = schema.namespaces['public']?.tables['UserProfile'];
  if (table === undefined) throw new Error('table UserProfile missing');
  return table;
}

describe('constraintRenamesForTableRename', () => {
  it.each([
    ['primary key', { primaryKey: { columns: ['id'] } }],
    ['unique constraint', { uniques: [{ columns: ['email'] }] }],
    [
      'foreign key',
      {
        foreignKeys: (tableName: string) => [
          { source: reference(tableName, ['accountId']), target: reference('account', ['id']) },
        ],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, ProfileSpec]>)(
    'refuses a renamed table whose %s has no name, since the working schema names them all',
    (_kind, spec) => {
      const table = unrenamedTable(spec);
      expect(() =>
        constraintRenamesForTableRename({
          schemaName: 'public',
          previous: table,
          next: table,
        }),
      ).toThrow(/has no name/);
    },
  );
});
