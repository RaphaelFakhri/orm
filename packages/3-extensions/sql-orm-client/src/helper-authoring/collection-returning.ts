import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import { blindCast } from '@internal/utils/casts';
import type { Collection } from '../collection';
import type { CollectionTypeState } from '../types';
import {
  type CollectionIndexes,
  collectionScopeTarget,
  type IndexData,
  type IndexScopeContext,
  type IndexScopeName,
  scopeNameOf,
} from './core';
import type { SubstituteArguments } from './index-literals';

/** The collection an operation receives and returns: any model, any state. */
export type ScopeTargetCollection = Collection<
  Contract<SqlStorage>,
  string,
  unknown,
  CollectionTypeState
>;

export type CollectionIndexScopes<C, Match, Args extends readonly unknown[]> = {
  readonly [Index in Extract<CollectionIndexes<C>[number], Match> as IndexScopeName<Index>]: (
    ...args: SubstituteArguments<Args, Index>
  ) => C;
};

export function defineCollectionIndexScopes<
  Match extends IndexData,
  Args extends readonly unknown[],
>(definition: {
  readonly match: (index: IndexData) => index is Match;
  readonly operation: (
    scope: IndexScopeContext<Match>,
    collection: ScopeTargetCollection,
    ...args: Args
  ) => ScopeTargetCollection;
}): <C extends object>(collection: C) => CollectionIndexScopes<C, Match, Args> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const target = blindCast<ScopeTargetCollection, 'every collection value is a Collection'>(
      collection,
    );
    const members: Record<string, (...args: Args) => typeof collection> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      members[scopeNameOf(index)] = (...args) =>
        blindCast<typeof collection, 'the operation is trusted to keep the collection type'>(
          definition.operation({ index, tableName }, target, ...args),
        );
    }
    return blindCast<
      CollectionIndexScopes<typeof collection, Match, Args>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}
