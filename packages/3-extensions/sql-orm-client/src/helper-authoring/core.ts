import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import type { AnyExpression, OrderByItem } from '@internal/sql-relational-core/ast';
import { blindCast } from '@internal/utils/casts';
import { storageTableForContract } from '../storage-resolution';
import type { ModelTableIndexes } from '../types';

/** The fields every index entry has at runtime. */
export interface IndexData {
  readonly name: string;
  readonly prefix?: string;
  readonly unique: boolean;
  readonly type?: string;
  readonly columns?: readonly string[];
  readonly expression?: string;
  readonly options?: Record<string, unknown>;
}

/** What a scope operation returns: the ORM client applies it to the collection. */
export interface ScopeRefinement {
  readonly filter: AnyExpression;
  readonly orderBy?: readonly OrderByItem[];
}

/** The first argument of every scope operation. */
export interface IndexScopeContext<Index> {
  readonly index: Index;
  readonly tableName: string;
}

/** The literal index entries of the table behind a collection type. */
export type CollectionIndexes<C> = C extends {
  readonly ctx: {
    readonly context: { readonly contract: infer TContract extends Contract<SqlStorage> };
  };
  readonly modelName: infer ModelName extends string;
  readonly namespaceId: infer NsId;
}
  ? ModelTableIndexes<TContract, ModelName, [NsId] extends [string] ? NsId : never>
  : readonly [];

/** The member name of an index: its authored name when it has one. */
export type IndexScopeName<Index> = Index extends { readonly prefix: infer Prefix extends string }
  ? Prefix
  : Index extends { readonly name: infer Name extends string }
    ? Name
    : never;

interface RuntimeCollection {
  readonly ctx: { readonly context: { readonly contract: Contract<SqlStorage> } };
  readonly namespaceId: string;
  readonly tableName: string;
  where(filter: AnyExpression): RuntimeCollection;
  orderBy(selectors: ReadonlyArray<() => OrderByItem>): RuntimeCollection;
}

function asRuntimeCollection(collection: object): RuntimeCollection {
  return blindCast<RuntimeCollection, 'every collection value is a CollectionImpl instance'>(
    collection,
  );
}

export function collectionScopeTarget(collection: object): {
  readonly indexes: readonly IndexData[];
  readonly tableName: string;
} {
  const runtime = asRuntimeCollection(collection);
  const table = storageTableForContract(
    runtime.ctx.context.contract,
    runtime.namespaceId,
    runtime.tableName,
  );
  return { indexes: table.indexes, tableName: runtime.tableName };
}

export function scopeNameOf(index: IndexData): string {
  return index.prefix ?? index.name;
}

export function applyRefinement<C extends object>(collection: C, refinement: ScopeRefinement): C {
  const filtered = asRuntimeCollection(collection).where(refinement.filter);
  const ordered =
    refinement.orderBy === undefined
      ? filtered
      : filtered.orderBy(refinement.orderBy.map((item) => () => item));
  return blindCast<C, 'a scope refinement keeps the collection type of its input'>(ordered);
}
