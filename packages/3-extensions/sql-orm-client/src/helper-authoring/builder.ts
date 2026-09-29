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
import type { SubstituteArguments } from './index-literals';

export type IndexScopes<C, Match, Args extends readonly unknown[]> = {
  readonly [Index in Extract<CollectionIndexes<C>[number], Match> as IndexScopeName<Index>]: (
    ...args: SubstituteArguments<Args, Index>
  ) => C;
};

export function defineIndexScopes<
  Match extends IndexData,
  Args extends readonly unknown[],
>(definition: {
  readonly match: (index: IndexData) => index is Match;
  readonly operation: (scope: IndexScopeContext<Match>, ...args: Args) => ScopeRefinement;
}): <C extends object>(collection: C) => IndexScopes<C, Match, Args> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const members: Record<string, (...args: Args) => typeof collection> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      members[scopeNameOf(index)] = (...args) =>
        applyRefinement(collection, definition.operation({ index, tableName }, ...args));
    }
    return blindCast<
      IndexScopes<typeof collection, Match, Args>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}

type OperationArguments<Operation> = Operation extends (
  scope: never,
  ...args: infer Args
) => ScopeRefinement
  ? Args
  : never;

export type IndexScopeOperations<C, Match, Operations> = {
  readonly [Index in Extract<CollectionIndexes<C>[number], Match> as IndexScopeName<Index>]: {
    readonly [Name in keyof Operations]: (
      ...args: SubstituteArguments<OperationArguments<Operations[Name]>, Index>
    ) => C;
  };
};

export function defineIndexScopeOperations<
  Match extends IndexData,
  Operations extends Record<
    string,
    (scope: IndexScopeContext<Match>, ...args: never[]) => ScopeRefinement
  >,
>(definition: {
  readonly match: (index: IndexData) => index is Match;
  readonly operations: Operations;
}): <C extends object>(collection: C) => IndexScopeOperations<C, Match, Operations> {
  return (collection) => {
    const { indexes, tableName } = collectionScopeTarget(collection);
    const members: Record<string, Record<string, (...args: never[]) => typeof collection>> = {};
    for (const index of indexes) {
      if (!definition.match(index)) continue;
      const operations: Record<string, (...args: never[]) => typeof collection> = {};
      for (const [name, operation] of Object.entries(definition.operations)) {
        operations[name] = (...args) =>
          applyRefinement(collection, operation({ index, tableName }, ...args));
      }
      members[scopeNameOf(index)] = operations;
    }
    return blindCast<
      IndexScopeOperations<typeof collection, Match, Operations>,
      'members are built from the same indexes the type reads'
    >(members);
  };
}
