import {
  applyRefinement,
  type CollectionIndexes,
  collectionScopeTarget,
  type IndexScopeName,
  scopeNameOf,
} from '../../src/helper-authoring/core';
import {
  type FakeTsQuery,
  type FullTextIndexShape,
  isFullTextIndex,
  rankOrder,
  textSearchFilter,
} from './fixture';

type FullTextFields<Index> = Index extends {
  readonly options: { readonly fields: readonly (readonly (infer Field)[])[] };
}
  ? Field
  : never;

export type FulltextSearchScopes<C> = {
  readonly [Index in Extract<
    CollectionIndexes<C>[number],
    FullTextIndexShape
  > as IndexScopeName<Index>]: (
    query: FakeTsQuery,
    options?: { readonly only?: FullTextFields<Index> },
  ) => C;
};

export function fulltextSearchScopes<C extends object>(collection: C): FulltextSearchScopes<C> {
  const { indexes, tableName } = collectionScopeTarget(collection);
  const members: Record<string, (query: FakeTsQuery, options?: { readonly only?: string }) => C> =
    {};
  for (const index of indexes) {
    if (!isFullTextIndex(index)) continue;
    members[scopeNameOf(index)] = (query, options) =>
      applyRefinement(collection, {
        filter: textSearchFilter(
          tableName,
          options?.only ?? index.options.fields[0]?.[0] ?? 'id',
          query,
        ),
        orderBy: rankOrder(tableName, 'id'),
      });
  }
  return members as FulltextSearchScopes<C>;
}
