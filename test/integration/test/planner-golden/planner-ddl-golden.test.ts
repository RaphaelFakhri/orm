/**
 * Plans every committed SQL contract from an empty database and compares the
 * planner's operations with the golden file recorded for it. A change in the
 * DDL either planner writes shows up here as a diff against the golden.
 *
 * A contract in a format today's validator refuses (old migration snapshots)
 * cannot be planned; its golden records the refusal instead, so the set of
 * contracts left out is committed and reviewed like the rest.
 *
 * Record the goldens again with `UPDATE_PLANNER_GOLDENS=1 pnpm --filter
 * integration-tests test test/planner-golden`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import postgresAdapterControl from '@internal/adapter-postgres/control';
import sqliteAdapterControl from '@internal/adapter-sqlite/control';
import { ContractValidationError } from '@internal/contract/contract-validation-error';
import postgresDriverControl from '@internal/driver-postgres/control';
import sqliteDriverControl from '@internal/driver-sqlite/control';
import arktypeJson from '@internal/extension-arktype-json/control';
import paradedb from '@internal/extension-paradedb/control';
import pgvector from '@internal/extension-pgvector/control';
import postgis from '@internal/extension-postgis/control';
import supabase from '@internal/extension-supabase/pack';
import sqlFamilyControl, { INIT_ADDITIVE_POLICY } from '@internal/family-sql/control';
import type { ControlExtensionDescriptor } from '@internal/framework-components/control';
import { APP_SPACE_ID, createControlStack } from '@internal/framework-components/control';
import { SqlSchemaIR } from '@internal/sql-schema-ir/types';
import postgresTargetControl from '@internal/target-postgres/control';
import { PostgresDatabaseSchemaNode } from '@internal/target-postgres/types';
import sqliteTargetControl from '@internal/target-sqlite/control';
import { join, resolve } from 'pathe';
import { describe, expect, it } from 'vitest';

const writeGoldens = process.env['UPDATE_PLANNER_GOLDENS'] === '1';
const repoRoot = resolve(import.meta.dirname, '../../../..');
const goldenDir = join(import.meta.dirname, 'golden');

type SqlExtension = ControlExtensionDescriptor<'sql', 'postgres'>;

const extensionsById: Readonly<Record<string, SqlExtension>> = {
  'arktype-json': arktypeJson,
  paradedb,
  pgvector,
  postgis,
  supabase,
};

interface CommittedContract {
  readonly path: string;
  readonly target: 'postgres' | 'sqlite';
  readonly extensionIds: readonly string[];
  readonly json: unknown;
}

function listCommittedSqlContracts(): readonly CommittedContract[] {
  const files = execFileSync('git', ['ls-files', '**/contract.json', '**/expected.contract.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line !== '')
    .sort();
  const contracts: CommittedContract[] = [];
  for (const path of files) {
    const json: unknown = JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
    if (typeof json !== 'object' || json === null) continue;
    const { target, targetFamily, extensions } = json as {
      target?: unknown;
      targetFamily?: unknown;
      extensions?: unknown;
    };
    if (targetFamily !== 'sql' || (target !== 'postgres' && target !== 'sqlite')) continue;
    const extensionIds =
      typeof extensions === 'object' && extensions !== null ? Object.keys(extensions).sort() : [];
    contracts.push({ path, target, extensionIds, json });
  }
  return contracts;
}

function goldenNameOf(path: string): string {
  return `${path.replaceAll('/', '__')}.golden.json`;
}

const emptyPostgresSchema = new PostgresDatabaseSchemaNode({
  namespaces: {},
  roles: [],
  existingSchemas: ['public'],
  pgVersion: 'unknown',
});

const emptySqliteSchema = new SqlSchemaIR({ tables: {} });

function readContract(
  family: { deserializeContract(json: unknown): unknown },
  json: unknown,
): { readonly contract: unknown } | { readonly unreadable: unknown } {
  try {
    return { contract: family.deserializeContract(json) };
  } catch (error) {
    if (error instanceof ContractValidationError) {
      return { unreadable: { kind: 'unreadable', phase: error.phase, message: error.message } };
    }
    throw error;
  }
}

async function planFromEmpty(contract: CommittedContract): Promise<unknown> {
  const extensions = contract.extensionIds.flatMap((id) => {
    const extension = extensionsById[id];
    return extension === undefined ? [] : [extension];
  });
  if (contract.target === 'postgres') {
    const stack = createControlStack({
      family: sqlFamilyControl,
      target: postgresTargetControl,
      adapter: postgresAdapterControl,
      driver: postgresDriverControl,
      extensions,
    });
    const family = sqlFamilyControl.create(stack);
    const read = readContract(family, contract.json);
    if ('unreadable' in read) return read.unreadable;
    const adapter = postgresAdapterControl.create(stack);
    const planner = postgresTargetControl.migrations.createPlanner(adapter);
    const result = planner.plan({
      contract: read.contract,
      schema: emptyPostgresSchema,
      policy: INIT_ADDITIVE_POLICY,
      fromContract: null,
      frameworkComponents: [
        postgresTargetControl,
        postgresAdapterControl,
        postgresDriverControl,
        ...extensions,
      ],
      spaceId: APP_SPACE_ID,
      snapshotsImportPath: '../../snapshots',
    });
    if (result.kind !== 'success') return result;
    return { kind: result.kind, operations: await Promise.all(result.plan.operations) };
  }
  const stack = createControlStack({
    family: sqlFamilyControl,
    target: sqliteTargetControl,
    adapter: sqliteAdapterControl,
    driver: sqliteDriverControl,
    extensions: [],
  });
  const family = sqlFamilyControl.create(stack);
  const read = readContract(family, contract.json);
  if ('unreadable' in read) return read.unreadable;
  const adapter = sqliteAdapterControl.create(stack);
  const planner = sqliteTargetControl.migrations.createPlanner(adapter);
  const result = planner.plan({
    contract: read.contract,
    schema: emptySqliteSchema,
    policy: INIT_ADDITIVE_POLICY,
    fromContract: null,
    frameworkComponents: [sqliteTargetControl, sqliteAdapterControl, sqliteDriverControl],
    spaceId: APP_SPACE_ID,
    snapshotsImportPath: '../../snapshots',
  });
  if (result.kind !== 'success') return result;
  return { kind: result.kind, operations: await Promise.all(result.plan.operations) };
}

const contracts = listCommittedSqlContracts();

describe('planner DDL goldens', () => {
  it('covers at least one Postgres and one SQLite contract', () => {
    expect(contracts.some((contract) => contract.target === 'postgres')).toBe(true);
    expect(contracts.some((contract) => contract.target === 'sqlite')).toBe(true);
  });

  it('has no golden file for a contract that no longer exists', () => {
    const expected = new Set(contracts.map((contract) => goldenNameOf(contract.path)));
    const stale = readdirSync(goldenDir).filter((name) => !expected.has(name));
    expect(stale).toEqual([]);
  });

  it.each(contracts.map((contract) => [contract.path, contract] as const))(
    'plans %s from an empty database as recorded',
    async (_path, contract) => {
      const planned = await planFromEmpty(contract);
      const rendered = `${JSON.stringify(
        {
          contract: contract.path,
          target: contract.target,
          extensions: contract.extensionIds,
          planned,
        },
        null,
        2,
      )}\n`;
      const goldenPath = join(goldenDir, goldenNameOf(contract.path));
      if (writeGoldens) {
        mkdirSync(goldenDir, { recursive: true });
        writeFileSync(goldenPath, rendered);
        return;
      }
      expect(existsSync(goldenPath), `no golden recorded at ${goldenPath}`).toBe(true);
      expect(rendered).toBe(readFileSync(goldenPath, 'utf8'));
    },
  );
});
