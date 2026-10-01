import { assembleDataTypes } from '@internal/framework-components/codec';
import {
  buildSqlContractFromDefinition,
  type ContractDefinition,
} from '@internal/sql-contract-ts/contract-builder';
import { assemblePostgresCodecRegistryWithBuiltins } from '@internal/target-postgres/codecs';
import postgresPack from '@internal/target-postgres/pack';
import { postgresCreateNamespace } from '@internal/target-postgres/types';
import { describe, expect, it } from 'vitest';

const CREATE_NAMESPACE = postgresCreateNamespace;
const ID_CODEC = 'pg/int4@1';
const TEXT_CODEC = 'pg/text@1';

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

describe('a value-object column on Postgres', () => {
  it('uses the codec of the Postgres value-object storage type', () => {
    const dataTypeLookup = assembleDataTypes([postgresPack]).lookup;
    const codecLookup = assemblePostgresCodecRegistryWithBuiltins([], dataTypeLookup);
    const contract = buildSqlContractFromDefinition(
      definitionWith(postgresPack),
      codecLookup,
      dataTypeLookup,
    );
    expect(
      contract.storage.namespaces['public']?.entries.table?.['user']?.columns['address'],
    ).toEqual({ codecId: 'pg/jsonb@1', dataType: 'pg/jsonb', nullable: false });
  });
});
