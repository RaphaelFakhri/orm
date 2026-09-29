import type { IndexScopeContext } from '../../src/helper-authoring/core';
import {
  defineIndexOperation,
  type IndexOperationKind,
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

interface FullText extends IndexOperationKind<FullTextIndexShape> {
  readonly operation: typeof fulltext<this['index']>;
}

export const fulltextSearchScopes = defineIndexOperation<FullText>({
  match: isFullTextIndex,
  operation: fulltext,
});
