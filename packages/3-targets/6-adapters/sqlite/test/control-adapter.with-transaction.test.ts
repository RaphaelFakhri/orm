import { DatabaseSync } from 'node:sqlite';
import { createSqliteBuiltinCodecLookup } from '@internal/target-sqlite/codecs';
import { describe, expect, it } from 'vitest';
import { SqliteControlAdapter } from '../src/core/control-adapter';

function createMemoryDriver() {
  const db = new DatabaseSync(':memory:');
  const statements: string[] = [];
  return {
    familyId: 'sql' as const,
    targetId: 'sqlite' as const,
    async query<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      statements.push(sql);
      const rows = db
        .prepare(sql)
        .all(...((params ?? []) as Array<string | number | null>)) as Row[];
      return { rows };
    },
    async close() {
      db.close();
    },
    statements,
  };
}

async function countRows(driver: ReturnType<typeof createMemoryDriver>): Promise<unknown> {
  const { rows } = await driver.query<{ n: number }>('SELECT count(*) AS n FROM t');
  return rows[0]?.n;
}

describe('SqliteControlAdapter.withTransaction', () => {
  const adapter = new SqliteControlAdapter(createSqliteBuiltinCodecLookup());

  it('commits the work of a callback that resolves and returns its value', async () => {
    const driver = createMemoryDriver();
    await driver.query('CREATE TABLE t (x integer)');

    const result = await adapter.withTransaction(driver, async () => {
      await driver.query('INSERT INTO t (x) VALUES (1)');
      return 'done';
    });

    expect(result).toBe('done');
    expect(await countRows(driver)).toBe(1);
    expect(driver.statements).toEqual([
      'CREATE TABLE t (x integer)',
      'BEGIN',
      'INSERT INTO t (x) VALUES (1)',
      'COMMIT',
      'SELECT count(*) AS n FROM t',
    ]);
  });

  it('rolls back the work of a callback that throws and rethrows its error', async () => {
    const driver = createMemoryDriver();
    await driver.query('CREATE TABLE t (x integer)');
    const failure = new Error('marker write failed');

    await expect(
      adapter.withTransaction(driver, async () => {
        await driver.query('INSERT INTO t (x) VALUES (1)');
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await countRows(driver)).toBe(0);
    expect(driver.statements.slice(1, 4)).toEqual([
      'BEGIN',
      'INSERT INTO t (x) VALUES (1)',
      'ROLLBACK',
    ]);
  });

  describe('when ROLLBACK itself fails', () => {
    const rollbackFailure = new Error('connection lost');
    const failingRollbackDriver = {
      familyId: 'sql' as const,
      targetId: 'sqlite' as const,
      async query<Row = Record<string, unknown>>(sql: string) {
        if (sql === 'ROLLBACK') throw rollbackFailure;
        return { rows: [] as Row[] };
      },
      async close() {},
    };

    it('rethrows the error that caused the rollback, with the rollback error as its cause', async () => {
      const failure = new Error('marker write failed');

      await expect(
        adapter.withTransaction(failingRollbackDriver, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(failure.cause).toBe(rollbackFailure);
    });

    it('keeps the cause the original error already has', async () => {
      const original = new Error('constraint violated');
      const failure = new Error('marker write failed', { cause: original });

      await expect(
        adapter.withTransaction(failingRollbackDriver, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(failure.cause).toBe(original);
    });
  });
});
