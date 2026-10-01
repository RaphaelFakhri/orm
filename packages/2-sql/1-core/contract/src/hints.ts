import type { Contract, ControlPolicy } from '@internal/contract/types';
import { blindCast } from '@internal/utils/casts';
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
