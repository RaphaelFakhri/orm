import { assembleDataTypes } from '@internal/framework-components/codec';
import { UNBOUND_NAMESPACE_ID } from '@internal/framework-components/ir';
import {
  buildSqlContractFromDefinition,
  type ContractDefinition,
} from '@internal/sql-contract-ts/contract-builder';
import { assembleSqliteCodecRegistry } from '@internal/target-sqlite/codecs';
import { sqliteCreateNamespace } from '@internal/target-sqlite/control';
import sqlitePack from '@internal/target-sqlite/pack';
import { describe, expect, it } from 'vitest';

const CREATE_NAMESPACE = sqliteCreateNamespace;
const ID_CODEC = 'sqlite/integer@1';
const TEXT_CODEC = 'sqlite/text@1';

function definitionWith(target: ContractDefinition['target']): ContractDefinition {
  return {
    warnings: undefined,
    target,
    createNamespace: CREATE_NAMESPACE,
    models: [
      {
        modelName: 'User',
        tableName: 'user',
        fields: [
          { fieldName: 'id', columnName: 'id', descriptor: { codecId: ID_CODEC }, nullable: false },
          {
            fieldName: 'address',
            columnName: 'address',
            valueObjectName: 'Address',
            nullable: false,
          },
        ],
        id: { columns: ['id'] },
      },
    ],
    valueObjects: [
      {
        name: 'Address',
        fields: [
          {
            fieldName: 'street',
            columnName: 'street',
            descriptor: { codecId: TEXT_CODEC },
            nullable: false,
          },
        ],
      },
    ],
  };
}

describe('a value-object column on SQLite', () => {
  it('uses the codec of the SQLite value-object storage type', () => {
    const codecLookup = assembleSqliteCodecRegistry(sqlitePack, []);
    const dataTypeLookup = assembleDataTypes([sqlitePack]).lookup;
    const contract = buildSqlContractFromDefinition(
      definitionWith(sqlitePack),
      codecLookup,
      dataTypeLookup,
    );
    expect(
      contract.storage.namespaces[UNBOUND_NAMESPACE_ID]?.entries.table?.['user']?.columns[
        'address'
      ],
    ).toEqual({ codecId: 'sqlite/json@1', dataType: 'sqlite/json', nullable: false });
  });
});
