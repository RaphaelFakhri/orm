import { checkSqlDefaultBody } from '@internal/family-sql/control';
import {
  dataTypeParams,
  renderSqlTypeName,
  type SqlTypeLookups,
  sqlDataTypeOfCodec,
} from '@internal/sql-contract/data-type';
import type { StorageColumn, StorageTypeInstance } from '@internal/sql-contract/types';
import { pgInt2, pgInt4, pgInt8, pgJson, pgJsonb } from '../data-types';
import { postgresError } from '../errors';
import { escapeLiteral, quoteIdentifier } from '../sql-utils';
import type { PostgresColumnDefault } from '../types';

const SERIAL_TYPES: ReadonlyMap<string, string> = new Map([
  [pgInt4.id, 'SERIAL'],
  [pgInt8.id, 'BIGSERIAL'],
  [pgInt2.id, 'SMALLSERIAL'],
]);

const JSON_DATA_TYPES: ReadonlySet<string> = new Set([pgJson.id, pgJsonb.id]);

/**
 * Sanity check against accidental SQL injection from malformed contract files.
 * Rejects semicolons, SQL comment tokens, and dollar-quoting.
 * Not a comprehensive security boundary — the contract is developer-authored.
 */
function assertSafeDefaultExpression(expression: string): void {
  if (checkSqlDefaultBody(expression) !== undefined) {
    throw postgresError(
      'CONTRACT.DEFAULT_INVALID',
      `Unsafe default expression in contract: "${expression}". ` +
        'Default expressions must not contain semicolons, SQL comment tokens, dollar-quoting, or subqueries.',
      { meta: { expression } },
    );
  }
}

/**
 * Renders the SQL type for a column in DDL context: the name its codec's data type is written
 * with, and its parameters. A `typeRef` column is written as a column of the referenced type.
 *
 * @param allowPseudoTypes - When true (default), autoincrement integer columns
 *   produce SERIAL/BIGSERIAL/SMALLSERIAL pseudo-types. Set to false for contexts
 *   like ALTER COLUMN TYPE where pseudo-types are invalid.
 */
export function buildColumnTypeSql(
  column: Pick<StorageColumn, 'codecId' | 'many' | 'typeParams' | 'typeRef' | 'default'>,
  types: SqlTypeLookups,
  storageTypes: Record<string, StorageTypeInstance> = {},
  allowPseudoTypes = true,
): string {
  const referenced = column.typeRef === undefined ? undefined : storageTypes[column.typeRef];
  const resolved = referenced ?? column;
  const dataType = sqlDataTypeOfCodec(resolved.codecId, types);

  if (allowPseudoTypes) {
    const columnDefault = column.default;
    const serial = SERIAL_TYPES.get(dataType.id);
    if (
      serial !== undefined &&
      columnDefault?.kind === 'function' &&
      columnDefault.expression === 'autoincrement()'
    ) {
      return serial;
    }
  }

  const typeSql = renderSqlTypeName(dataType, dataTypeParams(dataType, resolved.typeParams));
  return column.many ? `${typeSql}[]` : typeSql;
}

/** The column shape a literal default is rendered for: its type as SQL, and its data type. */
export interface DefaultLiteralColumn {
  readonly many?: boolean | undefined;
  readonly typeText: string;
  readonly dataType: string;
}

/** Autoincrement columns use SERIAL types, so this returns empty for them. */
export function buildColumnDefaultSql(
  columnDefault: PostgresColumnDefault | undefined,
  column?: DefaultLiteralColumn,
): string {
  if (!columnDefault) {
    return '';
  }

  switch (columnDefault.kind) {
    case 'literal':
      return `DEFAULT ${renderDefaultLiteral(columnDefault.value, column)}`;
    case 'function': {
      if (columnDefault.expression === 'autoincrement()') {
        return '';
      }
      assertSafeDefaultExpression(columnDefault.expression);
      return `DEFAULT (${columnDefault.expression})`;
    }
    case 'sequence':
      return `DEFAULT nextval('${escapeLiteral(quoteIdentifier(columnDefault.name))}'::regclass)`;
  }
}

export function renderDefaultLiteral(value: unknown, column?: DefaultLiteralColumn): string {
  const isJsonColumn = column !== undefined && JSON_DATA_TYPES.has(column.dataType);

  if (column?.many && Array.isArray(value)) {
    return renderArrayLiteralDefault(value, column.typeText);
  }

  if (value instanceof Date) {
    return `'${escapeLiteral(value.toISOString())}'`;
  }
  if (typeof value === 'string') {
    return `'${escapeLiteral(value)}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'NULL';
  }
  const json = JSON.stringify(value);
  if (isJsonColumn) {
    return `'${escapeLiteral(json)}'::${column.typeText}`;
  }
  return `'${escapeLiteral(json)}'`;
}

/**
 * An `ARRAY[...]` of quoted elements has type `text[]`, which Postgres does not assign to a list of
 * numbers, decimals, timestamps or enums, so the constructor is cast to the list type. Each element
 * is the text Postgres reads for its type: an `int8` or `numeric` value as decimal text, a temporal
 * value as ISO text. `typeText` is the element type or the list type, written as SQL, so a
 * user-defined type name arrives already quoted.
 */
export function renderArrayLiteralDefault(elements: unknown[], typeText: string): string {
  if (elements.length === 0) {
    return "'{}'";
  }
  const rendered = `ARRAY[${elements.map((el) => renderDefaultLiteral(el)).join(', ')}]`;
  if (typeText === '') return rendered;
  return `${rendered}::${typeText.endsWith('[]') ? typeText : `${typeText}[]`}`;
}
