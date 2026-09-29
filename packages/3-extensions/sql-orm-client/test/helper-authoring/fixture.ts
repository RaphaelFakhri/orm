import { BinaryExpr, ColumnRef, LiteralExpr, OrderByItem } from '@internal/sql-relational-core/ast';
import type { IndexData } from '../../src/helper-authoring/core';
import type { TestContract } from '../helpers';

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
    readonly name: 'post_title_body_search_0a1b2c3d';
    readonly prefix: 'post_title_body_search';
    readonly expression: string;
    readonly type: 'gin';
    readonly unique: false;
    readonly options: {
      readonly fields: readonly [readonly ['title', 'subtitle'], readonly ['body']];
      readonly language: 'english';
    };
  },
  {
    readonly name: 'post_title_search_4e5f6a7b';
    readonly prefix: 'post_title_search';
    readonly expression: string;
    readonly type: 'gin';
    readonly unique: false;
    readonly options: {
      readonly fields: readonly [readonly ['title']];
      readonly language: 'simple';
    };
  },
  {
    readonly name: 'posts_views_brin_1a2b3c4d';
    readonly prefix: 'posts_views_brin';
    readonly columns: readonly ['views'];
    readonly type: 'brin';
    readonly unique: false;
  },
];

export type HelperContract = WithTableIndexes<'posts', PostIndexes>;

export const postIndexesJson = [
  {
    name: 'post_title_body_search_0a1b2c3d',
    prefix: 'post_title_body_search',
    expression: "to_tsvector('english', title)",
    type: 'gin',
    unique: false,
    options: { fields: [['title', 'subtitle'], ['body']], language: 'english' },
  },
  {
    name: 'posts_views_brin_1a2b3c4d',
    prefix: 'posts_views_brin',
    columns: ['views'],
    type: 'brin',
    unique: false,
  },
];

export interface FakeTsQuery {
  readonly kind: 'tsquery';
  readonly text: string;
}

export function fakeTsQuery(text: string): FakeTsQuery {
  return { kind: 'tsquery', text };
}

export type FullTextIndexShape = IndexData & {
  readonly type: 'gin';
  readonly options: {
    readonly fields: readonly (readonly string[])[];
    readonly language: string;
  };
};

export function isFullTextIndex(index: IndexData): index is FullTextIndexShape {
  const options = index.options;
  return (
    index.type === 'gin' &&
    options !== undefined &&
    Array.isArray(options['fields']) &&
    typeof options['language'] === 'string'
  );
}

export function textSearchFilter(tableName: string, column: string, query: FakeTsQuery) {
  return new BinaryExpr('like', ColumnRef.of(tableName, column), LiteralExpr.of(`%${query.text}%`));
}

export function rankOrder(tableName: string, column: string) {
  return [OrderByItem.desc(ColumnRef.of(tableName, column))];
}
