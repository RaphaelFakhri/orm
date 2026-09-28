import type { ScopeOperationsShape } from '@internal/sql-orm-client';
import { BinaryExpr, ColumnRef, LiteralExpr } from '@internal/sql-relational-core/ast';
import type { SqlCollectionScopeContribution } from '@internal/sql-relational-core/query-lane-context';

export interface TsQuery {
  readonly kind: 'tsquery';
  readonly text: string;
}

export interface PostgresFullTextOperations<Index, Coll> {
  readonly expression: Index extends { readonly expression: infer E } ? E : never;
  fulltext(query: TsQuery): Coll;
}

export interface PostgresFullTextScope extends ScopeOperationsShape {
  readonly operations: PostgresFullTextOperations<this['index'], this['collection']>;
}

declare module '@internal/sql-orm-client' {
  interface CollectionScopeRegistry {
    readonly 'postgres/fulltext': PostgresFullTextScope;
  }
}

export const postgresFullTextScopes: SqlCollectionScopeContribution = {
  id: 'postgres/fulltext',
  operations: (_index, context) => ({
    fulltext: (...args: never[]) => {
      const [query] = args as unknown as [TsQuery];
      return {
        filter: new BinaryExpr(
          'like',
          ColumnRef.of(context.tableName, 'title'),
          LiteralExpr.of(`%${query.text}%`),
        ),
      };
    },
  }),
};
