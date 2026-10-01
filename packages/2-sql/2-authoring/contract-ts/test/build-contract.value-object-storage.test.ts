import type { AuthoringContributions } from '@internal/framework-components/authoring';
import type { TargetPackRef } from '@internal/framework-components/components';
import { describe, expect, it } from 'vitest';
import { createTestSqlNamespace } from '../../../1-core/contract/test/test-support';
import { testTypeLookups } from '../../../1-core/contract/test/test-type-lookups';
import { buildSqlContractFromDefinition } from '../src/contract-builder';
import type { ContractDefinition } from '../src/contract-definition';
import { unboundTables } from './unbound-tables';

function targetPack(authoring: AuthoringContributions | undefined): TargetPackRef<'sql', 't'> {
  return {
    kind: 'target',
    id: 't',
    familyId: 'sql',
    targetId: 't',
    version: '0.0.1',
    defaultNamespaceId: '__unbound__',
    ...(authoring === undefined ? {} : { authoring }),
  };
}

function definitionWith(target: TargetPackRef<'sql', 't'>): ContractDefinition {
  return {
    warnings: undefined,
    target,
    createNamespace: createTestSqlNamespace,
    models: [
      {
        modelName: 'User',
        tableName: 'user',
        fields: [
          {
            fieldName: 'id',
            columnName: 'id',
            descriptor: { codecId: 't/int4@1' },
            nullable: false,
          },
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
            descriptor: { codecId: 't/text@1' },
            nullable: false,
          },
        ],
      },
    ],
  };
}

function build(target: TargetPackRef<'sql', 't'>) {
  return buildSqlContractFromDefinition(
    definitionWith(target),
    testTypeLookups.codecLookup,
    testTypeLookups.dataTypeLookup,
  );
}

describe('the column of a value-object field', () => {
  it('uses the codec of the value-object storage type the target declares', () => {
    const contract = build(
      targetPack({
        type: { Doc: { kind: 'typeConstructor', output: { codecId: 't/doc@1' } } },
        valueObjectStorageType: 'Doc',
      }),
    );
    expect(unboundTables(contract.storage)['user']?.columns['address']).toEqual({
      codecId: 't/doc@1',
      dataType: 't/doc',
      nullable: false,
    });
  });

  it('is refused when the target declares no value-object storage type', () => {
    expect(() => build(targetPack(undefined))).toThrow(
      expect.objectContaining({
        code: 'CONTRACT.VALIDATION_FAILED',
        message:
          "storage.namespaces.__unbound__.entries.table.user.columns.address: a value-object column needs the stack's value-object storage type, and the stack declares none",
      }),
    );
  });
});
