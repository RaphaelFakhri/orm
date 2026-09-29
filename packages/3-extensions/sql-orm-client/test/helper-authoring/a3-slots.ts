import type { IndexScopeKind } from '../../src/helper-authoring/slots';
import { defineIndexScopeKind } from '../../src/helper-authoring/slots';
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

interface FullTextOptions<Index> {
  readonly only?: FullTextFields<Index>;
}

interface FullTextScopeKind extends IndexScopeKind {
  readonly match: FullTextIndexShape;
  readonly member: (
    query: FakeTsQuery,
    options?: FullTextOptions<this['index']>,
  ) => this['collection'];
}

export const fulltextSearchScopes = defineIndexScopeKind<FullTextScopeKind>({
  match: isFullTextIndex,
  operation: ({ index, tableName }, query: FakeTsQuery, options?: { readonly only?: string }) => ({
    filter: textSearchFilter(
      tableName,
      options?.only ?? index.options.fields[0]?.[0] ?? 'id',
      query,
    ),
    orderBy: rankOrder(tableName, 'id'),
  }),
});
