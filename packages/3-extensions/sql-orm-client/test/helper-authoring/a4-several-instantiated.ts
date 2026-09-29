import type { IndexScopeContext } from '../../src/helper-authoring/core';
import {
  defineIndexOperations,
  type IndexOperationsKind,
} from '../../src/helper-authoring/instantiated';
import {
  type FakeTsQuery,
  type FullTextIndexShape,
  isFullTextIndex,
  rankOrder,
  textSearchFilter,
} from './fixture';

function fulltext<I extends FullTextIndexShape>(
  { index, tableName }: IndexScopeContext<I>,
  query: FakeTsQuery,
  options?: { readonly only?: I['options']['fields'][number][number] },
) {
  return {
    filter: textSearchFilter(
      tableName,
      options?.only ?? index.options.fields[0]?.[0] ?? 'id',
      query,
    ),
    orderBy: rankOrder(tableName, 'id'),
  };
}

function phrase<I extends FullTextIndexShape>(
  { index, tableName }: IndexScopeContext<I>,
  query: FakeTsQuery,
) {
  return { filter: textSearchFilter(tableName, index.options.fields[0]?.[0] ?? 'id', query) };
}

interface FullText extends IndexOperationsKind<FullTextIndexShape> {
  readonly fulltext: typeof fulltext<this['index']>;
  readonly phrase: typeof phrase<this['index']>;
}

export const fulltextSearchScopes = defineIndexOperations<FullText>({
  match: isFullTextIndex,
  operations: { fulltext, phrase },
});
