import { defineIndexScopes } from '../../src/helper-authoring/builder';
import type { IndexElement } from '../../src/helper-authoring/index-literals';
import { type FakeTsQuery, isFullTextIndex, rankOrder, textSearchFilter } from './fixture';

export const fulltextSearchScopes = defineIndexScopes({
  match: isFullTextIndex,
  operation: (
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
});
