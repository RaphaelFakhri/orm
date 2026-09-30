import {
  ColumnRef,
  EqColJoinOn,
  JoinAst,
  LockingClause,
  ProjectionItem,
  SelectAst,
  TableSource,
} from '@internal/sql-relational-core/ast';
import { postgresCodecDescriptorRegistry } from '@internal/target-postgres/codecs';
import { applicationDomainOf } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';
import { TestSqlContractSerializer as SqlContractSerializer } from '../../../../2-sql/9-family/test/test-sql-contract-serializer';
import { createPostgresAdapter } from '../src/core/adapter';
import { postgresAdapterDescriptorMeta } from '../src/core/descriptor-meta';
import { renderLoweredSql } from '../src/core/sql-renderer';
import type { PostgresContract } from '../src/core/types';

const contract = new SqlContractSerializer().deserializeContract({
  target: 'postgres',
  targetFamily: 'sql',
  profileHash: 'test-profile',
  roots: {},
  capabilities: {},
  extensions: {},
  meta: {},
  storage: {
    storageHash: 'test-core',
    namespaces: {
      __unbound__: {
        id: '__unbound__',
        entries: {
          table: {
            job: {
              columns: {
                id: { codecId: 'pg/int4@1', nativeType: 'int4', nullable: false },
              },
              uniques: [],
              indexes: [],
              foreignKeys: [],
            },
            worker: {
              columns: {
                jobId: { codecId: 'pg/int4@1', nativeType: 'int4', nullable: false },
              },
              uniques: [],
              indexes: [],
              foreignKeys: [],
            },
          },
        },
      },
    },
  },
  domain: applicationDomainOf({ models: {} }),
}) as PostgresContract;

const lockFlags = {
  sql: {
    forUpdate: true,
    forShare: true,
    lockOf: true,
    lockNowait: true,
    lockSkipLocked: true,
  },
  postgres: {
    forNoKeyUpdate: true,
    forKeyShare: true,
  },
};

const base = SelectAst.from(TableSource.named('job', 'j')).withProjection([
  ProjectionItem.of('id', ColumnRef.of('j', 'id')),
]);
const baseSql = 'SELECT "j"."id" AS "id" FROM "job" AS "j"';

describe('Postgres adapter row locking', () => {
  const adapter = createPostgresAdapter();

  function lower(locking: ReadonlyArray<LockingClause>, ast: SelectAst = base): string {
    return adapter.lower(ast.withLocking(locking), { contract }).sql;
  }

  it('reports the seven locking capability flags', () => {
    expect(adapter.profile.capabilities).toMatchObject(lockFlags);
    expect(postgresAdapterDescriptorMeta.capabilities).toMatchObject(lockFlags);
  });

  it.each([
    ['forUpdate', 'FOR UPDATE'],
    ['forNoKeyUpdate', 'FOR NO KEY UPDATE'],
    ['forShare', 'FOR SHARE'],
    ['forKeyShare', 'FOR KEY SHARE'],
  ] as const)('renders %s', (strength, keyword) => {
    expect(lower([LockingClause.of(strength)])).toBe(`${baseSql} ${keyword}`);
  });

  it('renders nowait and skipLocked', () => {
    expect(lower([LockingClause.of('forUpdate', { wait: 'nowait' })])).toBe(
      `${baseSql} FOR UPDATE NOWAIT`,
    );
    expect(lower([LockingClause.of('forUpdate', { wait: 'skipLocked' })])).toBe(
      `${baseSql} FOR UPDATE SKIP LOCKED`,
    );
  });

  it('renders of as unqualified quoted names', () => {
    const joined = base.withJoins([
      JoinAst.inner(
        TableSource.named('worker', 'w'),
        EqColJoinOn.of(ColumnRef.of('j', 'id'), ColumnRef.of('w', 'jobId')),
      ),
    ]);

    expect(lower([LockingClause.of('forUpdate', { of: ['j'], wait: 'nowait' })])).toBe(
      `${baseSql} FOR UPDATE OF "j" NOWAIT`,
    );
    expect(lower([LockingClause.of('forShare', { of: ['j', 'w'] })], joined)).toBe(
      'SELECT "j"."id" AS "id" FROM "job" AS "j" INNER JOIN "worker" AS "w" ON "j"."id" = "w"."jobId" FOR SHARE OF "j", "w"',
    );
  });

  it('renders two clauses in order', () => {
    expect(
      lower([
        LockingClause.of('forUpdate', { of: ['j'] }),
        LockingClause.of('forKeyShare', { of: ['w'], wait: 'skipLocked' }),
      ]),
    ).toBe(`${baseSql} FOR UPDATE OF "j" FOR KEY SHARE OF "w" SKIP LOCKED`);
  });

  it('renders the clause after LIMIT and OFFSET', () => {
    expect(lower([LockingClause.of('forUpdate')], base.withLimit(1).withOffset(2))).toBe(
      `${baseSql} LIMIT 1 OFFSET 2 FOR UPDATE`,
    );
  });

  describe('refuses a clause the adapter did not report', () => {
    const withoutFlag = (group: 'sql' | 'postgres', flag: string) => ({
      ...lockFlags,
      [group]: { ...lockFlags[group], [flag]: false },
    });

    it.each([
      ['sql', 'forUpdate', LockingClause.of('forUpdate')],
      ['sql', 'forShare', LockingClause.of('forShare')],
      ['postgres', 'forNoKeyUpdate', LockingClause.of('forNoKeyUpdate')],
      ['postgres', 'forKeyShare', LockingClause.of('forKeyShare')],
      ['sql', 'lockOf', LockingClause.of('forUpdate', { of: ['j'] })],
      ['sql', 'lockNowait', LockingClause.of('forUpdate', { wait: 'nowait' })],
      ['sql', 'lockSkipLocked', LockingClause.of('forUpdate', { wait: 'skipLocked' })],
    ] as const)('without %s.%s', (group, flag, clause) => {
      const capability = `${group}.${flag}`;
      expect(() =>
        renderLoweredSql(
          base.withLocking([clause]),
          contract,
          postgresCodecDescriptorRegistry,
          withoutFlag(group, flag),
        ),
      ).toThrow(
        expect.objectContaining({
          name: 'StructuredError',
          code: 'RUNTIME.AST_UNSUPPORTED',
          message: `Postgres adapter does not report capability ${capability}, which this locking clause needs`,
          meta: { target: 'postgres', capability },
        }),
      );
    });
  });
});
