import { blindCast } from '@internal/utils/casts';
import {
  applyRefinement,
  type CollectionIndexes,
  collectionScopeTarget,
  type IndexData,
  type IndexScopeContext,
  type IndexScopeName,
  type ScopeRefinement,
  scopeNameOf,
} from './core';

/** The type half of an index scope: the ORM client fills `index` and `collection`, the author reads them in `member`. */
export interface IndexScopeKind {
  readonly match: IndexData;
  readonly index: unknown;
  readonly collection: unknown;
  readonly member: unknown;
}

type MemberOf<Kind extends IndexScopeKind, Index, C> = (Kind & {
  readonly index: Index;
  readonly collection: C;
})['member'];

export type IndexKindScopes<Kind extends IndexScopeKind, C> = {
  readonly [Index in Extract<
    CollectionIndexes<C>[number],
    Kind['match']
  > as IndexScopeName<Index>]: MemberOf<Kind, Index, C>;
};

export function defineIndexScopeKind<Kind extends IndexScopeKind>(definition: {
  readonly match: (index: IndexData) => index is Kind['match'];
  readonly operation: (
    scope: IndexScopeContext<Kind['match']>,
    ...args: never[]
  ) => ScopeRefinement;
}): <C extends object>(collection: C) => IndexKindScopes<Kind, C> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const members: Record<string, (...args: never[]) => typeof collection> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      members[scopeNameOf(index)] = (...args) =>
        applyRefinement(collection, definition.operation({ index, tableName }, ...args));
    }
    return blindCast<
      IndexKindScopes<Kind, typeof collection>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}
