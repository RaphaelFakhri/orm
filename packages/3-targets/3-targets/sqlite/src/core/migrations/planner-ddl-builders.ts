/**
 * Low-level DDL fragment builders for SQLite migrations.
 *
 * These helpers consume `StorageColumn` (the contract shape, possibly with
 * `typeRef`) and produce string fragments. They are called once per column
 * at the call-construction boundary in `issue-planner.ts` / strategies to
 * build flat `SqliteColumnSpec`s; the operation factories themselves never
 * see `StorageColumn` or `storageTypes`.
 */

import { checkSqlDefaultBody } from '@internal/family-sql/control';
import {
  dataTypeParams,
  renderSqlTypeName,
  type SqlTypeLookups,
  sqlDataTypeOfCodec,
} from '@internal/sql-contract/data-type';
import type {
  StorageColumn,
  StorageTable,
  StorageTypeInstance,
} from '@internal/sql-contract/types';
import { sqliteInteger } from '../data-types';
import { sqliteError } from '../errors';
import { escapeLiteral, quoteIdentifier } from '../sql-utils';

type SqliteColumnDefault = StorageColumn['default'];

function assertSafeDefaultExpression(expression: string): void {
  if (checkSqlDefaultBody(expression) !== undefined) {
    throw sqliteError(
      'CONTRACT.DEFAULT_INVALID',
      `Unsafe default expression in contract: "${expression}". ` +
        'Default expressions must not contain semicolons, SQL comment tokens, dollar-quoting, or subqueries.',
      { meta: { expression } },
    );
  }
}

/**
 * Renders the column's DDL type token (e.g. `"INTEGER"`, `"TEXT"`): the name the data type of its
 * codec is written with, in upper case. Resolves `typeRef` against `storageTypes`.
 */
export function buildColumnTypeSql(
  column: Pick<StorageColumn, 'codecId' | 'typeParams' | 'typeRef'>,
  types: SqlTypeLookups,
  storageTypes: Record<string, StorageTypeInstance> = {},
): string {
  const resolved = resolveColumnTypeMetadata(column, storageTypes);
  const dataType = sqlDataTypeOfCodec(resolved.codecId, types);
  return renderSqlTypeName(dataType, dataTypeParams(dataType, resolved.typeParams)).toUpperCase();
}

/**
 * Renders the column's `DEFAULT …` clause. Returns the empty string when
 * there is no default, and also when the default is `autoincrement()` —
 * SQLite encodes that as `INTEGER PRIMARY KEY AUTOINCREMENT` inline on the
 * column definition, not as a separate DEFAULT.
 */
export function buildColumnDefaultSql(
  columnDefault: SqliteColumnDefault | undefined,
  dataType?: string,
): string {
  if (!columnDefault) return '';

  switch (columnDefault.kind) {
    case 'literal':
      return `DEFAULT ${renderDefaultLiteral(columnDefault.value, dataType)}`;
    case 'function': {
      if (columnDefault.expression === 'autoincrement()') return '';
      if (columnDefault.expression === 'now()') return "DEFAULT (datetime('now'))";
      assertSafeDefaultExpression(columnDefault.expression);
      return `DEFAULT (${columnDefault.expression})`;
    }
  }
}

const DIGIT_TEXT = /^-?\d+$/;

/**
 * A literal default in SQL. An `integer` column stores digit text in the contract, which is written
 * as the integer it names.
 */
export function renderDefaultLiteral(value: unknown, dataType?: string): string {
  if (dataType === sqliteInteger.id && typeof value === 'string' && DIGIT_TEXT.test(value)) {
    return value;
  }
  if (value instanceof Date) {
    return `'${escapeLiteral(value.toISOString())}'`;
  }
  if (typeof value === 'string') {
    return `'${escapeLiteral(value)}'`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value === null) {
    return 'NULL';
  }
  return `'${escapeLiteral(JSON.stringify(value))}'`;
}

export function buildCreateIndexSql(
  tableName: string,
  indexName: string,
  columns: readonly string[],
  unique = false,
): string {
  const uniqueKeyword = unique ? 'UNIQUE ' : '';
  return `CREATE ${uniqueKeyword}INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})`;
}

export function buildDropIndexSql(indexName: string): string {
  return `DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`;
}

/**
 * True when the column is rendered inline as `INTEGER PRIMARY KEY
 * AUTOINCREMENT`. Requires the column's default to be `autoincrement()` and
 * the column to be the sole member of the table's primary key — anything
 * else falls back to a separate PRIMARY KEY constraint with a default
 * AUTOINCREMENT semantics expressed elsewhere.
 */
export function isInlineAutoincrementPrimaryKey(table: StorageTable, columnName: string): boolean {
  if (table.primaryKey?.columns.length !== 1) return false;
  if (table.primaryKey.columns[0] !== columnName) return false;
  const column = table.columns[columnName];
  return column?.default?.kind === 'function' && column.default.expression === 'autoincrement()';
}

type ResolvedColumnTypeMetadata = Pick<StorageColumn, 'codecId' | 'typeParams'>;

export function resolveColumnTypeMetadata(
  column: Pick<StorageColumn, 'codecId' | 'typeParams' | 'typeRef'>,
  storageTypes: Record<string, StorageTypeInstance>,
): ResolvedColumnTypeMetadata {
  if (!column.typeRef) {
    return column;
  }
  const referencedType = storageTypes[column.typeRef];
  if (!referencedType) {
    throw sqliteError(
      'CONTRACT.TYPE_UNKNOWN',
      `Storage type "${column.typeRef}" referenced by column is not defined in storage.types.`,
      { meta: { typeRef: column.typeRef } },
    );
  }
  return {
    codecId: referencedType.codecId,
    typeParams: referencedType.typeParams,
  };
}
