import { defineIndexScopes } from '../../src/helper-authoring/builder';
import { type FakeTsQuery, isFullTextIndex, rankOrder, textSearchFilter } from './fixture';

export const fulltextSearchScopes = defineIndexScopes({
  match: isFullTextIndex,
  operation: (
    { index, tableName },
    query: FakeTsQuery,
    options?: { readonly language?: string },
  ) => ({
    filter: textSearchFilter(
      tableName,
      index.options.fields[0]?.[0] ?? options?.language ?? 'id',
      query,
    ),
    orderBy: rankOrder(tableName, 'id'),
  }),
});
