import { createDataTypeLookup } from '@internal/framework-components/codec';
import { assembleAuthoringContributions } from '@internal/framework-components/control';
import { buildSymbolTable } from '@internal/psl-parser';
import { parse } from '@internal/psl-parser/syntax';
import { interpretPslDocumentToSqlContract } from '@internal/sql-contract-psl';
import { postgresDataTypes } from '@internal/target-postgres/data-types';
import { describe, expect, it } from 'vitest';
import {
  postgresAuthoringEntityTypes,
  postgresAuthoringModelAttributes,
  postgresAuthoringPslBlockDescriptors,
} from '../src/core/authoring';
import { postgresCreateNamespace } from '../src/core/postgres-schema';

const postgresDataTypeLookup = createDataTypeLookup(postgresDataTypes);

const assembled = assembleAuthoringContributions([
  {
    authoring: {
      entityTypes: postgresAuthoringEntityTypes,
      pslBlockDescriptors: postgresAuthoringPslBlockDescriptors,
      modelAttributes: postgresAuthoringModelAttributes,
    },
  },
]);

const postgresTarget = {
  kind: 'target' as const,
  familyId: 'sql' as const,
  targetId: 'postgres' as const,
  id: 'postgres',
  version: '0.0.1',
  capabilities: {},
  defaultNamespaceId: 'public',
};

const scalarColumnDescriptors = new Map<string, { codecId: string; nativeType: string }>([
  ['String', { codecId: 'pg/text@1', nativeType: 'text' }],
  ['Int', { codecId: 'pg/int4@1', nativeType: 'int4' }],
  ['Boolean', { codecId: 'pg/bool@1', nativeType: 'bool' }],
  ['BigInt', { codecId: 'pg/int8@1', nativeType: 'int8' }],
  ['Float', { codecId: 'pg/float8@1', nativeType: 'float8' }],
  ['Decimal', { codecId: 'pg/numeric@1', nativeType: 'numeric' }],
  ['DateTime', { codecId: 'pg/timestamptz-temporal@1', nativeType: 'timestamptz' }],
  ['Json', { codecId: 'pg/json@1', nativeType: 'json' }],
  ['Jsonb', { codecId: 'pg/jsonb@1', nativeType: 'jsonb' }],
  ['Bytes', { codecId: 'pg/bytea@1', nativeType: 'bytea' }],
]);

function interpret(text: string) {
  const { document, sources } = parse(text, 'psl-policy-authoring.test.psl');
  const { symbolTable } = buildSymbolTable({
    documents: [document],
    sources,
  });
  return interpretPslDocumentToSqlContract({
    dataTypeLookup: postgresDataTypeLookup,
    documents: [document],
    symbolTable,
    sources,
    target: postgresTarget,
    scalarColumnDescriptors,
    authoringContributions: assembled,
    composedExtensionContracts: new Map(),
    createNamespace: postgresCreateNamespace,
    capabilities: { sql: { scalarList: true } },
  });
}

function policiesOf(text: string) {
  const result = interpret(text);
  if (!result.ok)
    throw new Error(`Expected the document to interpret: ${JSON.stringify(result.failure)}`);
  return Object.fromEntries(
    Object.entries(result.value.storage.namespaces).flatMap(([namespaceId, namespace]) => {
      const policies = Object.values(
        (
          namespace as {
            readonly entries: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
          }
        ).entries['policy'] ?? {},
      ).map((policy) => {
        const {
          namespaceId: recorded,
          tableName,
          roles,
        } = policy as {
          readonly namespaceId: string;
          readonly tableName: string;
          readonly roles: readonly string[];
        };
        return { namespaceId: recorded, tableName, roles };
      });
      return policies.length === 0 ? [] : [[namespaceId, policies]];
    }),
  );
}

const authNamespace = `
namespace auth {
  model account {
    id Int @id

    @@rls
  }
}

namespace unbound {
  role auditor {
  }
}
`;

describe('policies that reference another namespace', () => {
  it('lowers a top-level policy into the namespace of its qualified target', () => {
    expect(
      policiesOf(`${authNamespace}
policy_select p_read {
  target = auth.account
  roles  = [unbound.auditor, app_user]
  using  = "true"
}
`),
    ).toEqual({
      auth: [{ namespaceId: 'auth', tableName: 'account', roles: ['app_user', 'auditor'] }],
    });
  });

  it('lowers a policy declared in one namespace into the namespace of its target in another', () => {
    expect(
      policiesOf(`${authNamespace}
namespace public {
  policy_all p_admin {
    target = auth.account
    roles  = [unbound.auditor]
    using  = "true"
  }
}
`),
    ).toEqual({ auth: [{ namespaceId: 'auth', tableName: 'account', roles: ['auditor'] }] });
  });
});
