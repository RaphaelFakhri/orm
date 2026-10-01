import { isArrayEqual } from '@internal/utils/array-equal';
import type { PostgresTableSchemaNode } from '../schema-ir/postgres-table-schema-node';
import {
  defaultForeignKeyName,
  defaultPrimaryKeyName,
  defaultUniqueName,
} from './default-constraint-names';
import { RenameConstraintCall } from './op-factory-call';

export interface TableRenameConstraintInput {
  /** The schema name the rename calls carry: the unbound sentinel for the unbound namespace. */
  readonly schemaName: string;
  /** The DDL schema the table lives in, for foreign keys that leave their referenced schema implicit. */
  readonly ddlSchema: string;
  /** The renamed table as the working schema has it after the rename, its constraint names as they are in the database. */
  readonly previous: PostgresTableSchemaNode;
  /** The table in the destination schema. */
  readonly next: PostgresTableSchemaNode;
}

/**
 * The constraint renames that follow a table rename. Each primary key, unique constraint and foreign key of the renamed table is paired with the destination constraint of the same kind on the same columns, and for a foreign key the same referenced table and columns. A paired constraint is renamed to the destination's explicit name, or else to the name the planner derives from the new table name, when that differs from its name in the database. An unpaired constraint is being dropped or changed and keeps its name. Indexes and checks are not handled here: their wire names pair by content hash in the index and check rename passes.
 */
export function constraintRenamesForTableRename(
  input: TableRenameConstraintInput,
): readonly RenameConstraintCall[] {
  const { schemaName, ddlSchema, previous, next } = input;
  const table = next.name;
  const rename = (
    kind: 'primaryKey' | 'unique' | 'foreignKey',
    actualName: string,
    target: string | undefined,
  ): readonly RenameConstraintCall[] =>
    target === undefined || target === actualName
      ? []
      : [new RenameConstraintCall(schemaName, table, kind, actualName, target)];

  const nextPrimaryKey = next.primaryKey;
  const primaryKey =
    previous.primaryKey === undefined
      ? []
      : rename(
          'primaryKey',
          previous.primaryKey.name ?? defaultPrimaryKeyName(previous.name),
          nextPrimaryKey !== undefined &&
            isArrayEqual(previous.primaryKey.columns, nextPrimaryKey.columns)
            ? (nextPrimaryKey.name ?? defaultPrimaryKeyName(table))
            : undefined,
        );

  const uniques = previous.uniques.flatMap((unique) => {
    const paired = next.uniques.find((candidate) =>
      isArrayEqual(candidate.columns, unique.columns),
    );
    return rename(
      'unique',
      unique.name ?? defaultUniqueName(previous.name, unique.columns),
      paired === undefined ? undefined : (paired.name ?? defaultUniqueName(table, paired.columns)),
    );
  });

  const referencedSchemaOf = (fk: PostgresTableSchemaNode['foreignKeys'][number]) =>
    fk.resolvedReferencedNamespace ?? ddlSchema;
  const foreignKeys = previous.foreignKeys.flatMap((fk) => {
    const paired = next.foreignKeys.find(
      (candidate) =>
        isArrayEqual(candidate.columns, fk.columns) &&
        candidate.referencedTable === fk.referencedTable &&
        isArrayEqual(candidate.referencedColumns, fk.referencedColumns) &&
        referencedSchemaOf(candidate) === referencedSchemaOf(fk),
    );
    return rename(
      'foreignKey',
      fk.name ?? defaultForeignKeyName(previous.name, fk.columns),
      paired === undefined ? undefined : (paired.name ?? defaultForeignKeyName(table, fk.columns)),
    );
  });

  return [...primaryKey, ...uniques, ...foreignKeys];
}
