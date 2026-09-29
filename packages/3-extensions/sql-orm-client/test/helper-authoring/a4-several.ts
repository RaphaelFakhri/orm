import { defineIndexScopeOperations } from '../../src/helper-authoring/builder';
import type { IndexElement } from '../../src/helper-authoring/index-literals';
import {
  type FakeTsQuery,
  type FullTextIndexShape,
  isFullTextIndex,
  rankOrder,
  textSearchFilter,
} from './fixture';

export const fulltextSearchScopes = defineIndexScopeOperations({
  match: (index): index is FullTextIndexShape => isFullTextIndex(index),
  operations: {
    fulltext: (
      { index, tableName },
      query: FakeTsQuery,
      options?: { readonly only?: IndexElement<'options.fields'> },
    ) => ({
      filter: textSearchFilter(
        tableName,
        options?.only ?? index.options.fields[0]?.[0] ?? 'id',
        query,
      ),
      orderBy: rankOrder(tableName, 'id'),
    }),
    phrase: ({ index, tableName }, query: FakeTsQuery) => ({
      filter: textSearchFilter(tableName, index.options.fields[0]?.[0] ?? 'id', query),
    }),
  },
});
