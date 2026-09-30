import {
  dataTypeParams,
  renderSqlTypeName,
  type SqlTypeLookups,
  sqlDataTypeOfCodec,
  unquotedSqlBaseName,
} from '@internal/sql-contract/data-type';
import type { StorageColumn, StorageTypeInstance } from '@internal/sql-contract/types';
import { postgresCreateNamespace } from '../postgres-schema';
import { quoteIdentifierWhereNeeded } from '../sql-utils';
import { resolveColumnTypeMetadata } from './planner-type-resolution';

/**
 * String-keyed entry points the migration ops use to render
 * schema-qualified DDL and catalog checks. The `schema` argument is
 * interpreted as a namespace coordinate: the framework `__unbound__`
 * sentinel resolves to the late-bound `PostgresUnboundSchema` singleton
 * (which elides the qualifier so `search_path` decides at runtime); any
 * other id materialises a `PostgresSchema(id)` whose qualifier is the
 * named schema. Helpers route through these `Namespace` concretions so
 * the unbound branch lives in the polymorphic override, not the call
 * site.
 */
export function qualifyTableName(schema: string, table: string): string {
  return postgresCreateNamespace({ id: schema, entries: { table: {} } }).qualifyTable(table);
}

const FORMAT_TYPE_DISPLAY: ReadonlyMap<string, string> = new Map([
  ['int2', 'smallint'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['float4', 'real'],
  ['float8', 'double precision'],
  ['bool', 'boolean'],
  ['timestamp', 'timestamp without time zone'],
  ['timestamptz', 'timestamp with time zone'],
  ['time', 'time without time zone'],
  ['timetz', 'time with time zone'],
]);

export function buildExpectedFormatType(
  column: StorageColumn,
  types: SqlTypeLookups,
  storageTypes: Record<string, StorageTypeInstance> = {},
): string {
  const resolved = resolveColumnTypeMetadata(column, storageTypes);

  const dataType = sqlDataTypeOfCodec(resolved.codecId, types);
  const params = dataTypeParams(dataType, resolved.typeParams);
  if (dataType.sql.claimsKind !== undefined) {
    return unquotedSqlBaseName(dataType, params)
      .split('.')
      .map(quoteIdentifierWhereNeeded)
      .join('.');
  }
  if (Object.keys(params).length > 0) {
    return renderSqlTypeName(dataType, params);
  }

  return FORMAT_TYPE_DISPLAY.get(resolved.nativeType) ?? resolved.nativeType;
}
