import { createPostgresBuiltinCodecLookup } from '@internal/target-postgres/codecs';
import { createPostgresBuiltinDataTypeLookup } from '@internal/target-postgres/data-types';
import { describe, expect, it } from 'vitest';
import { PostgresControlAdapter } from '../src/core/control-adapter';

function createCapturingDriver() {
  const statements: string[] = [];
  return {
    familyId: 'sql' as const,
    targetId: 'postgres' as const,
    async query<Row = Record<string, unknown>>(sql: string) {
      statements.push(sql);
      return { rows: [] as Row[] };
    },
    async close() {},
    statements,
  };
}

describe('PostgresControlAdapter.withTransaction', () => {
  const adapter = new PostgresControlAdapter(
    createPostgresBuiltinCodecLookup(),
    createPostgresBuiltinDataTypeLookup(),
  );

  it('wraps a callback that resolves in BEGIN and COMMIT and returns its value', async () => {
    const driver = createCapturingDriver();

    const result = await adapter.withTransaction(driver, async () => {
      await driver.query('UPDATE marker');
      return 'done';
    });

    expect(result).toBe('done');
    expect(driver.statements).toEqual(['BEGIN', 'UPDATE marker', 'COMMIT']);
  });

  it('rolls back a callback that throws and rethrows its error', async () => {
    const driver = createCapturingDriver();
    const failure = new Error('marker write failed');

    await expect(
      adapter.withTransaction(driver, async () => {
        await driver.query('UPDATE marker');
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(driver.statements).toEqual(['BEGIN', 'UPDATE marker', 'ROLLBACK']);
  });
});
