import { defineCollectionIndexScopes } from '../../src/helper-authoring/collection-returning';
import type { IndexElement } from '../../src/helper-authoring/index-literals';
import { type FakeTsQuery, isFullTextIndex, rankOrder, textSearchFilter } from './fixture';

export const fulltextSearchScopes = defineCollectionIndexScopes({
  match: isFullTextIndex,
  operation: (
    { index, tableName },
    collection,
    query: FakeTsQuery,
    options?: { readonly only?: IndexElement<'options.fields'> },
  ) =>
    collection
      .where(
        textSearchFilter(tableName, options?.only ?? index.options.fields[0]?.[0] ?? 'id', query),
      )
      .orderBy(rankOrder(tableName, 'id').map((item) => () => item)),
});
