import { orm } from '../src/orm';
import contractJson from './fixtures/generated/contract.json' with { type: 'json' };
import {
  buildTestContextFromContract,
  createMockRuntime,
  deserializeTestContract,
  type TestContract,
} from './helpers';

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
    readonly name: 'post_title_search_9f8e7d6c';
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
    readonly name: 'posts_views_brin_11223344';
    readonly prefix: 'posts_views_brin';
    readonly columns: readonly ['views'];
    readonly type: 'brin';
    readonly unique: false;
  },
];

export type SearchContract = WithTableIndexes<'posts', PostIndexes>;

function fullTextIndexJson(prefix: string, fields: string[][], language: string) {
  return {
    name: `${prefix}_0a1b2c3d`,
    prefix,
    expression: `to_tsvector('${language}', ${fields.flat().join(" || ' ' || ")})`,
    type: 'gin',
    unique: false,
    options: { fields, language },
  };
}

export function searchContract(): SearchContract {
  const json = JSON.parse(JSON.stringify(contractJson));
  const posts = json.storage.namespaces.public.entries.table.posts;
  posts.indexes = [
    ...posts.indexes,
    fullTextIndexJson('post_title_body_search', [['title', 'subtitle'], ['body']], 'english'),
    fullTextIndexJson('post_title_search', [['title']], 'simple'),
  ];
  return deserializeTestContract(json) as unknown as SearchContract;
}

export function searchSetup() {
  const runtime = createMockRuntime();
  const context = buildTestContextFromContract(searchContract());
  return { runtime, context, db: orm({ runtime, context }) };
}
