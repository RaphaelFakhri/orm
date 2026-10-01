import type { Contract, ControlPolicy } from '@internal/contract/types';
import { blindCast } from '@internal/utils/casts';
import { ifDefined } from '@internal/utils/defined';
import { contractError } from './contract-errors';
import type { SqlStorage } from './types';

export interface SqlContractHints {
  readonly namespaces: Readonly<Record<string, SqlNamespaceHints>>;
}

export interface SqlNamespaceHints {
  readonly tables: Readonly<Record<string, SqlTableHints>>;
}

export type SqlTableHints =
  | {
      readonly was: string;
      readonly deleted?: undefined;
      readonly control?: undefined;
      readonly columns?: Readonly<Record<string, SqlColumnHint>>;
    }
  | {
      readonly was?: undefined;
      readonly deleted: true;
      readonly control?: ControlPolicy;
      readonly columns?: undefined;
    }
  | {
      readonly was?: undefined;
      readonly deleted?: undefined;
      readonly control?: undefined;
      readonly columns: Readonly<Record<string, SqlColumnHint>>;
    };

export type SqlColumnHint =
  | { readonly was: string; readonly deleted?: undefined }
  | { readonly was?: undefined; readonly deleted: true };

export function sqlContractHints(contract: Contract<SqlStorage>): SqlContractHints | undefined {
  return blindCast<
    SqlContractHints | undefined,
    'a Contract<SqlStorage> exists only after the SQL contract schema has validated its hints section against the SqlContractHints shape'
  >(contract.hints);
}

type HintSubject = (name: string) => string;

const tableSubject: HintSubject = (name) => `table "${name}"`;

function columnSubject(table: string): HintSubject {
  return (name) => `column "${table}"."${name}"`;
}

interface HintLocation {
  readonly namespaceId: string;
  readonly table: string;
  readonly column?: string;
}

function hintInvalid(message: string, location: HintLocation, was?: string): never {
  throw contractError('CONTRACT.HINT_INVALID', `Contract hints: ${message}.`, {
    meta: { ...location, ...ifDefined('was', was) },
  });
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedEntries<T>(record: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => compareCodePoints(a, b));
}

class OldNameClaims {
  private readonly claimants = new Map<string, string>();

  constructor(
    private readonly subject: HintSubject,
    private readonly declaredNames: Readonly<Record<string, unknown>>,
  ) {}

  claim(name: string, was: string, location: HintLocation): void {
    if (Object.hasOwn(this.declaredNames, was)) {
      hintInvalid(
        `${this.subject(name)} claims it was "${was}", which the contract also declares`,
        location,
        was,
      );
    }
    const other = this.claimants.get(was);
    if (other !== undefined) {
      hintInvalid(
        `${this.subject(other)} and "${name}" both claim they were "${was}"`,
        location,
        was,
      );
    }
    this.claimants.set(was, name);
  }
}

function assertOnlyDeletedTables(namespaceId: string, hints: SqlNamespaceHints): void {
  for (const [table, entry] of sortedEntries(hints.tables)) {
    if (entry.deleted !== true) {
      hintInvalid(
        `${tableSubject(table)} names namespace "${namespaceId}", which the contract does not declare`,
        { namespaceId, table },
      );
    }
  }
}

function assertColumnHintsConsistent(
  location: HintLocation,
  columns: Readonly<Record<string, SqlColumnHint>>,
  declaredColumns: Readonly<Record<string, unknown>>,
): void {
  const claims = new OldNameClaims(columnSubject(location.table), declaredColumns);
  for (const [column, hint] of sortedEntries(columns)) {
    if (hint.was !== undefined) {
      claims.claim(column, hint.was, { ...location, column });
    }
  }
}

function assertNamespaceHintsConsistent(
  namespaceId: string,
  hints: SqlNamespaceHints,
  declaredTables: Readonly<Record<string, { readonly columns: Readonly<Record<string, unknown>> }>>,
): void {
  const claims = new OldNameClaims(tableSubject, declaredTables);
  for (const [table, entry] of sortedEntries(hints.tables)) {
    if (entry.deleted === true) {
      continue;
    }
    const location = { namespaceId, table };
    const declaredTable = declaredTables[table];
    if (declaredTable === undefined) {
      hintInvalid(
        `${tableSubject(table)} carries a hint but the contract does not declare it`,
        location,
      );
    }
    if (entry.was !== undefined) {
      claims.claim(table, entry.was, location);
    }
    if (entry.columns !== undefined) {
      assertColumnHintsConsistent(location, entry.columns, declaredTable.columns);
    }
  }
}

export function assertContractHintsConsistent(contract: Contract<SqlStorage>): void {
  const hints = sqlContractHints(contract);
  if (hints === undefined) {
    return;
  }
  for (const [namespaceId, namespaceHints] of sortedEntries(hints.namespaces)) {
    const namespace = contract.storage.namespaces[namespaceId];
    if (namespace === undefined) {
      assertOnlyDeletedTables(namespaceId, namespaceHints);
      continue;
    }
    assertNamespaceHintsConsistent(namespaceId, namespaceHints, namespace.entries.table ?? {});
  }
}
