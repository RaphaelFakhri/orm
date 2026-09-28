import { BinaryExpr, ColumnRef, LiteralExpr, OrderByItem } from '@internal/sql-relational-core/ast';
import type { SqlCollectionScopeContribution } from '@internal/sql-relational-core/query-lane-context';
import type { ScopeOperationsShape } from '../src/scopes';
import type { TestContract } from './helpers';

type ReplaceKey<T, K extends keyof T, V> = Omit<T, K> & { readonly [P in K]: V };

type Storage = TestContract['storage'];
type Namespaces = Storage['namespaces'];
type Public = Namespaces['public'];
type Entries = Public['entries'];
type Tables = Entries['table'];

type WithTableIndexes<Table extends keyof Tables, Indexes> = ReplaceKey<
  TestContract,
  'storage',
  ReplaceKey<
    Storage,
    'namespaces',
    ReplaceKey<
      Namespaces,
      'public',
      ReplaceKey<
        Public,
        'entries',
        ReplaceKey<
          Entries,
          'table',
          ReplaceKey<Tables, Table, ReplaceKey<Tables[Table], 'indexes', Indexes>>
        >
      >
    >
  >
>;

export type PostIndexes = readonly [
  {
    readonly name: 'posts_user_id_idx_6c952402';
    readonly prefix: 'posts_user_id_idx';
    readonly columns: readonly ['user_id'];
    readonly unique: false;
  },
  {
    readonly name: 'search_0a1b2c3d';
    readonly prefix: 'search';
    readonly expression: string;
    readonly unique: false;
    readonly type: 'gin';
    readonly options: {
      readonly language: 'english';
      readonly weights: readonly [readonly ['title']];
    };
  },
  {
    readonly name: 'where';
    readonly expression: string;
    readonly unique: false;
    readonly type: 'gin';
    readonly options: {
      readonly language: 'simple';
      readonly weights: readonly [readonly ['title']];
    };
  },
  {
    readonly name: 'published';
    readonly expression: string;
    readonly unique: false;
    readonly type: 'gin';
    readonly options: {
      readonly language: 'simple';
      readonly weights: readonly [readonly ['title']];
    };
  },
  {
    readonly name: 'byViews';
    readonly columns: readonly ['views'];
    readonly unique: false;
    readonly type: 'brin';
  },
];

export interface PostScopes {
  readonly search: {
    readonly type: 'test/fulltext';
    readonly params: { readonly index: 'search' };
  };
  readonly where: { readonly type: 'test/fulltext'; readonly params: { readonly index: 'where' } };
  readonly published: {
    readonly type: 'test/fulltext';
    readonly params: { readonly index: 'published' };
  };
  readonly byViews: { readonly type: 'test/brin'; readonly params: { readonly index: 'byViews' } };
  readonly unregistered: {
    readonly type: 'test/unregistered';
    readonly params: { readonly index: 'search' };
  };
}

type Domain = TestContract['domain'];
type DomainNamespaces = Domain['namespaces'];
type DomainPublic = DomainNamespaces['public'];
type Models = DomainPublic['models'];

type WithModelScopes<TContract, Model extends keyof Models, Scopes> = Omit<TContract, 'domain'> & {
  readonly domain: ReplaceKey<
    Domain,
    'namespaces',
    ReplaceKey<
      DomainNamespaces,
      'public',
      ReplaceKey<
        DomainPublic,
        'models',
        ReplaceKey<Models, Model, Models[Model] & { readonly scopes: Scopes }>
      >
    >
  >;
};

export type ScopedContract = WithModelScopes<
  WithTableIndexes<'posts', PostIndexes>,
  'Post',
  PostScopes
>;

export interface FakeTsQuery {
  readonly kind: 'tsquery';
  readonly text: string;
}

export function fakeTsQuery(text: string): FakeTsQuery {
  return { kind: 'tsquery', text };
}

type WeightedColumn<Index> = Index extends {
  readonly options: { readonly weights: readonly (readonly (infer Column)[])[] };
}
  ? Column
  : never;

type IndexLanguage<Index> = Index extends { readonly options: { readonly language: infer L } }
  ? L
  : never;

interface FullTextOperations<Index, Coll> {
  readonly language: IndexLanguage<Index>;
  fulltext(query: FakeTsQuery, options?: { readonly only?: WeightedColumn<Index> }): Coll;
}

interface FullTextScope extends ScopeOperationsShape {
  readonly operations: FullTextOperations<this['index'], this['collection']>;
}

declare module '../src/scopes' {
  interface CollectionScopeRegistry {
    readonly 'test/fulltext': FullTextScope;
    readonly 'test/brin': BrinScope;
  }
}

export const fullTextScopes: SqlCollectionScopeContribution = {
  id: 'test/fulltext',
  operations: (index, context) => {
    const options = index['options'] as {
      language: string;
      weights: readonly (readonly string[])[];
    };
    const firstColumn = options.weights[0]?.[0] ?? 'id';
    const column = ColumnRef.of(context.tableName, firstColumn);
    return {
      language: (() => {
        throw new Error('language is type-level only in the spike');
      }) as never,
      fulltext: ((query: FakeTsQuery) => ({
        filter: new BinaryExpr('like', column, LiteralExpr.of(`%${query.text}%`)),
        defaultOrderBy: [OrderByItem.desc(column)],
      })) as never,
    };
  },
};

interface BrinOperations<Coll> {
  between(low: number, high: number): Coll;
}

interface BrinScope extends ScopeOperationsShape {
  readonly operations: BrinOperations<this['collection']>;
}

export const brinScopes: SqlCollectionScopeContribution = {
  id: 'test/brin',
  operations: (index, context) => {
    const column = ColumnRef.of(context.tableName, (index['columns'] as string[])[0] ?? 'id');
    return {
      between: ((low: number, _high: number) => ({
        filter: new BinaryExpr('gte', column, LiteralExpr.of(low)),
      })) as never,
    };
  },
};
