import type { ScopeOperationsShape } from '@internal/sql-orm-client';
import { BinaryExpr, ColumnRef, LiteralExpr } from '@internal/sql-relational-core/ast';
import type { SqlCollectionScopeContribution } from '@internal/sql-relational-core/query-lane-context';

export interface SpikeExtensionOperations<Index, Coll> {
  readonly physicalName: Index extends { readonly name: infer N } ? N : never;
  titleStartsWith(prefix: string): Coll;
}

export interface SpikeExtensionScope extends ScopeOperationsShape {
  readonly operations: SpikeExtensionOperations<this['index'], this['collection']>;
}

declare module '@internal/sql-orm-client' {
  interface CollectionScopeRegistry {
    readonly 'pgvector/spike': SpikeExtensionScope;
  }
}

export const spikeExtensionScopes: SqlCollectionScopeContribution = {
  id: 'pgvector/spike',
  operations: (_index, context) => ({
    titleStartsWith: (...args: never[]) => {
      const [prefix] = args as unknown as [string];
      return {
        filter: new BinaryExpr(
          'like',
          ColumnRef.of(context.tableName, 'title'),
          LiteralExpr.of(`${prefix}%`),
        ),
      };
    },
  }),
};
