import {
  defineIndexOperation,
  defineIndexScopes,
  type IndexData,
  type IndexElement,
  type IndexOperationKind,
  type IndexScopeContext,
} from '@internal/sql-orm-client';
import {
  type AnyExpression,
  BinaryExpr,
  ColumnRef,
  OrderByItem,
} from '@internal/sql-relational-core/ast';

type FullTextIndex = IndexData & {
  readonly type: 'gin';
  readonly options: {
    readonly fields: readonly (readonly string[])[];
    readonly language: string;
  };
};

function isFullTextIndex(index: IndexData): index is FullTextIndex {
  const options = index.options;
  return (
    index.type === 'gin' &&
    options !== undefined &&
    Array.isArray(options['fields']) &&
    typeof options['language'] === 'string'
  );
}

function fulltext<I extends FullTextIndex>(
  { index, tableName }: IndexScopeContext<I>,
  query: AnyExpression,
  options?: { readonly only?: I['options']['fields'][number][number] },
) {
  const column = ColumnRef.of(tableName, options?.only ?? index.options.fields[0]?.[0] ?? 'id');
  return { filter: new BinaryExpr('eq', column, query), orderBy: [OrderByItem.desc(column)] };
}

interface FullText extends IndexOperationKind<FullTextIndex> {
  readonly operation: typeof fulltext<this['index']>;
}

export const fulltextSearchScopes = defineIndexOperation<FullText>({
  match: isFullTextIndex,
  operation: fulltext,
});

export const fulltextSearchScopesWithPlaceholders = defineIndexScopes({
  match: isFullTextIndex,
  operation: (
    { index, tableName },
    query: AnyExpression,
    options?: { readonly only?: IndexElement<'options.fields'> },
  ) => {
    const column = ColumnRef.of(tableName, options?.only ?? index.options.fields[0]?.[0] ?? 'id');
    return { filter: new BinaryExpr('eq', column, query), orderBy: [OrderByItem.desc(column)] };
  },
});
