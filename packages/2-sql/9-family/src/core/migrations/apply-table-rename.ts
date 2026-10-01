import type { Contract } from '@internal/contract/types';
import { UNBOUND_NAMESPACE_ID } from '@internal/framework-components/ir';
import {
  ForeignKey,
  type ForeignKeyReference,
  type ForeignKeyReferenceInput,
  isMaterializedSqlNamespace,
  type SqlNamespace,
  type SqlNamespaceBase,
  type SqlNamespaceEntries,
  SqlStorage,
  StorageTable,
} from '@internal/sql-contract/types';
import { InternalError } from '@internal/utils/internal-error';
import { notOk, ok, type Result } from '@internal/utils/result';
import type { StructuredError } from '@internal/utils/structured-error';
import { sqlFamilyError } from '../errors';

export const TABLE_RENAME_UNMATCHED_CODE = 'MIGRATION.TABLE_RENAME_UNMATCHED';

/** A table a migration renames: `namespaceId` is `undefined` when the migration leaves the namespace to the contracts. */
export interface TableRename {
  readonly namespaceId: string | undefined;
  readonly from: string;
  readonly to: string;
}

/** A rename after its table was found in the start contract. */
export interface ResolvedTableRename {
  readonly namespaceId: string;
  readonly from: string;
  readonly to: string;
}

export interface ApplyTableRenameInput {
  readonly startContract: Contract<SqlStorage> | null;
  readonly endContract: Contract<SqlStorage>;
  readonly rename: TableRename;
}

export interface AppliedTableRename {
  /** The start contract with the table under its new name. */
  readonly contract: Contract<SqlStorage>;
  readonly rename: ResolvedTableRename;
}

function tableLabel(namespaceId: string | undefined, tableName: string): string {
  return namespaceId === undefined || namespaceId === UNBOUND_NAMESPACE_ID
    ? tableName
    : `${namespaceId}.${tableName}`;
}

function namespacesDeclaring(contract: Contract<SqlStorage>, tableName: string): string[] {
  return Object.values(contract.storage.namespaces)
    .filter((namespace) => Object.hasOwn(namespace.entries.table ?? {}, tableName))
    .map((namespace) => namespace.id);
}

function declares(contract: Contract<SqlStorage>, namespaceId: string, tableName: string): boolean {
  return Object.hasOwn(contract.storage.namespaces[namespaceId]?.entries.table ?? {}, tableName);
}

/** Refuses a `renameTable` call that does not match the migration's contracts, with `MIGRATION.TABLE_RENAME_UNMATCHED`. */
export function unmatchedTableRename(rename: TableRename, reason: string): StructuredError {
  return sqlFamilyError(
    TABLE_RENAME_UNMATCHED_CODE,
    `renameTable "${tableLabel(rename.namespaceId, rename.from)}" to "${rename.to}" does not match the migration's contracts: ${reason}.`,
    {
      why: "renameTable must name a table of the migration's start contract and a new name that the end contract has and the start contract does not. Make the rename its own schema change, so the migration's start contract is the schema before the rename and its end contract the schema after it, and check the spelling and the namespace.",
      meta: { from: rename.from, to: rename.to },
    },
  );
}

/** The tables a rename is resolved against. `where` names that state in a refusal, for example `at this point of the migration`. */
export interface TableLookup {
  readonly where: string;
  declares(namespaceId: string, tableName: string): boolean;
  namespacesDeclaring(tableName: string): readonly string[];
}

function startContractLookup(contract: Contract<SqlStorage>): TableLookup {
  return {
    where: 'in the start contract',
    declares: (namespaceId, tableName) => declares(contract, namespaceId, tableName),
    namespacesDeclaring: (tableName) => namespacesDeclaring(contract, tableName),
  };
}

/**
 * Resolves a table a migration renames: the table must exist in `lookup` (in exactly one namespace when the namespace is not given), and the new name must exist in the end contract and not in `lookup`; otherwise the rename is refused with `MIGRATION.TABLE_RENAME_UNMATCHED`.
 */
export function resolveTableRenameAgainst(
  lookup: TableLookup,
  endContract: Contract<SqlStorage>,
  rename: TableRename,
): Result<ResolvedTableRename, StructuredError> {
  const namespaceIds =
    rename.namespaceId === undefined
      ? lookup.namespacesDeclaring(rename.from)
      : lookup.declares(rename.namespaceId, rename.from)
        ? [rename.namespaceId]
        : [];
  const [namespaceId, ...others] = namespaceIds;
  if (namespaceId === undefined) {
    return notOk(
      unmatchedTableRename(
        rename,
        `table "${tableLabel(rename.namespaceId, rename.from)}" does not exist ${lookup.where}`,
      ),
    );
  }
  if (others.length > 0) {
    return notOk(
      unmatchedTableRename(
        rename,
        `table "${rename.from}" is declared in more than one namespace (${namespaceIds.join(', ')}); name its namespace`,
      ),
    );
  }
  if (lookup.declares(namespaceId, rename.to)) {
    return notOk(
      unmatchedTableRename(
        rename,
        `table "${tableLabel(namespaceId, rename.to)}" already exists ${lookup.where}`,
      ),
    );
  }
  if (!declares(endContract, namespaceId, rename.to)) {
    return notOk(
      unmatchedTableRename(
        rename,
        `table "${tableLabel(namespaceId, rename.to)}" does not exist in the end contract`,
      ),
    );
  }
  return ok({ namespaceId, from: rename.from, to: rename.to });
}

function renamedReference(
  reference: ForeignKeyReference,
  rename: ResolvedTableRename,
): ForeignKeyReference | ForeignKeyReferenceInput {
  const local = reference.spaceId === undefined;
  if (
    !local ||
    reference.namespaceId !== rename.namespaceId ||
    reference.tableName !== rename.from
  ) {
    return reference;
  }
  return { ...reference, tableName: rename.to };
}

function renameForeignKeys(table: StorageTable, rename: ResolvedTableRename): StorageTable {
  const touched = table.foreignKeys.some(
    (fk) =>
      renamedReference(fk.source, rename) !== fk.source ||
      renamedReference(fk.target, rename) !== fk.target,
  );
  if (!touched) return table;
  return new StorageTable({
    ...table,
    foreignKeys: table.foreignKeys.map(
      (fk) =>
        new ForeignKey({
          ...fk,
          source: renamedReference(fk.source, rename),
          target: renamedReference(fk.target, rename),
        }),
    ),
  });
}

/**
 * The same namespace instance with only `entries` replaced: every own
 * property, including the non-enumerable `kind`, is carried over onto the
 * same prototype, so the target's namespace class (its `qualifyTable`,
 * `ddlSchemaName`, entity getters) keeps working on the copy. This is the
 * one place a frozen contract node is rebuilt without its constructor: the
 * constructors re-hydrate `entries` from raw input, which the already
 * hydrated entities here do not need.
 */
function withEntries(namespace: SqlNamespaceBase, entries: SqlNamespaceEntries): SqlNamespaceBase {
  const copy: SqlNamespaceBase = Object.create(Object.getPrototypeOf(namespace), {
    ...Object.getOwnPropertyDescriptors(namespace),
    entries: {
      value: Object.freeze(entries),
      enumerable: true,
      writable: false,
      configurable: false,
    },
  });
  return Object.freeze(copy);
}

function renameTableInNamespace(
  namespace: SqlNamespace,
  rename: ResolvedTableRename,
): SqlNamespace {
  const ownsTable = rename.namespaceId === namespace.id;
  const tables = Object.entries(namespace.entries.table ?? {}).map(
    ([name, table]) =>
      [
        ownsTable && name === rename.from ? rename.to : name,
        renameForeignKeys(table, rename),
      ] as const,
  );
  const untouched = tables.every(([name, table]) => namespace.entries.table?.[name] === table);
  if (untouched) return namespace;
  if (!isMaterializedSqlNamespace(namespace)) {
    throw new InternalError(
      `applyTableRename: namespace "${namespace.id}" is not a materialized SQL namespace`,
    );
  }
  return withEntries(namespace, { ...namespace.entries, table: Object.fromEntries(tables) });
}

function renameTableInContract(
  contract: Contract<SqlStorage>,
  rename: ResolvedTableRename,
): Contract<SqlStorage> {
  const namespaces = Object.fromEntries(
    Object.entries(contract.storage.namespaces).map(([id, namespace]) => [
      id,
      renameTableInNamespace(namespace, rename),
    ]),
  );
  const materialized: Record<string, SqlNamespaceBase> = {};
  for (const [id, namespace] of Object.entries(namespaces)) {
    if (!isMaterializedSqlNamespace(namespace)) {
      throw new InternalError(
        `applyTableRename: namespace "${id}" is not a materialized SQL namespace`,
      );
    }
    materialized[id] = namespace;
  }
  return {
    ...contract,
    storage: new SqlStorage({
      storageHash: contract.storage.storageHash,
      ...(contract.storage.types === undefined ? {} : { types: contract.storage.types }),
      namespaces: materialized,
    }),
  };
}

/**
 * Resolves the table a migration renames against its start and end contracts and returns the start contract with that table under its new name, so a diff against the end contract sees the table under one name. The table must exist in the start contract (in exactly one namespace when the namespace is not given), and the new name must exist in the end contract and not in the start contract; otherwise the rename is refused with `MIGRATION.TABLE_RENAME_UNMATCHED`.
 *
 * Foreign keys that name the renamed table on either side are retargeted. Index, unique, check and primary-key names are carried unchanged.
 */
export function applyTableRename(
  input: ApplyTableRenameInput,
): Result<AppliedTableRename, StructuredError> {
  if (input.startContract === null) {
    return notOk(unmatchedTableRename(input.rename, 'the migration has no start contract'));
  }
  const resolved = resolveTableRenameAgainst(
    startContractLookup(input.startContract),
    input.endContract,
    input.rename,
  );
  if (!resolved.ok) return resolved;
  return ok({
    contract: renameTableInContract(input.startContract, resolved.value),
    rename: resolved.value,
  });
}
