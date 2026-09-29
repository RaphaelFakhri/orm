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

/**
 * Names an operation's type for one index. The ORM client fills `index` with the literal index
 * entry; the author writes `operation: typeof myOperation<this['index']>`.
 */
export interface IndexOperationKind<Match extends IndexData = IndexData> {
  readonly match: Match;
  readonly index: Match;
  readonly operation: unknown;
}

type OperationFor<Kind extends IndexOperationKind, Index> = (Kind & {
  readonly index: Index;
})['operation'];

type MemberOf<Operation, C> = Operation extends (
  scope: never,
  ...args: infer Args
) => ScopeRefinement
  ? (...args: Args) => C
  : never;

export type IndexOperationScopes<Kind extends IndexOperationKind, C> = {
  readonly [Index in Extract<
    CollectionIndexes<C>[number],
    Kind['match']
  > as IndexScopeName<Index>]: MemberOf<OperationFor<Kind, Index>, C>;
};

export function defineIndexOperation<Kind extends IndexOperationKind>(definition: {
  readonly match: (index: IndexData) => index is Kind['match'];
  readonly operation: (
    scope: IndexScopeContext<Kind['match']>,
    ...args: never[]
  ) => ScopeRefinement;
}): <C extends object>(collection: C) => IndexOperationScopes<Kind, C> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const members: Record<string, (...args: never[]) => typeof collection> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      members[scopeNameOf(index)] = (...args) =>
        applyRefinement(collection, definition.operation({ index, tableName }, ...args));
    }
    return blindCast<
      IndexOperationScopes<Kind, typeof collection>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}

/** Several operations per index: each property other than `match` and `index` names one operation. */
export interface IndexOperationsKind<Match extends IndexData = IndexData> {
  readonly match: Match;
  readonly index: Match;
}

type OperationNames<Kind> = Exclude<keyof Kind, 'match' | 'index'>;

export type IndexOperationsScopes<Kind extends IndexOperationsKind, C> = {
  readonly [Index in Extract<
    CollectionIndexes<C>[number],
    Kind['match']
  > as IndexScopeName<Index>]: {
    readonly [Name in OperationNames<Kind>]: MemberOf<(Kind & { readonly index: Index })[Name], C>;
  };
};

export function defineIndexOperations<Kind extends IndexOperationsKind>(definition: {
  readonly match: (index: IndexData) => index is Kind['match'];
  readonly operations: {
    readonly [Name in OperationNames<Kind>]: (
      scope: IndexScopeContext<Kind['match']>,
      ...args: never[]
    ) => ScopeRefinement;
  };
}): <C extends object>(collection: C) => IndexOperationsScopes<Kind, C> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const members: Record<string, Record<string, (...args: never[]) => typeof collection>> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      const operations: Record<string, (...args: never[]) => typeof collection> = {};
      for (const [name, operation] of Object.entries<
        (scope: IndexScopeContext<Kind['match']>, ...args: never[]) => ScopeRefinement
      >(definition.operations)) {
        operations[name] = (...args) =>
          applyRefinement(collection, operation({ index, tableName }, ...args));
      }
      members[scopeNameOf(index)] = operations;
    }
    return blindCast<
      IndexOperationsScopes<Kind, typeof collection>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}
