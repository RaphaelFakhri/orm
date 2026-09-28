import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import type { RuntimeQueryable } from '../src/types';
import { type FakeTsQuery, fakeTsQuery, type ScopedContract } from './scopes-fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<ScopedContract>;

const q = fakeTsQuery('hello');

const db = orm({ runtime, context });

test('a declared scope exists under its declared name', () => {
  expectTypeOf(db.public.Post.scopes).not.toBeAny();
  expectTypeOf(db.public.Post.scopes.search.fulltext).toBeFunction();
  expectTypeOf(db.public.Post.scopes.search.fulltext).parameter(0).toEqualTypeOf<FakeTsQuery>();
  expectTypeOf<keyof typeof db.public.Post.scopes>().toEqualTypeOf<
    'search' | 'where' | 'published' | 'byViews'
  >();
});

test('an index with no declared scope offers no scope', () => {
  // @ts-expect-error no scope is declared for this index
  db.public.Post.scopes.posts_user_id_idx;
});

test('a declared scope whose type is not in the registry is omitted', () => {
  // @ts-expect-error test/unregistered has no registry entry
  db.public.Post.scopes.unregistered;
});

test('operations read the literal index data', () => {
  expectTypeOf(db.public.Post.scopes.search.language).toEqualTypeOf<'english'>();
  expectTypeOf(db.public.Post.scopes.where.language).toEqualTypeOf<'simple'>();
  db.public.Post.scopes.search.fulltext(q, { only: 'title' });
  // @ts-expect-error views is not a column of the index
  db.public.Post.scopes.search.fulltext(q, { only: 'views' });
  // @ts-expect-error a plain string is not a query
  db.public.Post.scopes.search.fulltext('hello');
});

test('each contribution supplies the operations of its own index kind', () => {
  expectTypeOf(db.public.Post.scopes.byViews.between).toBeFunction();
  // @ts-expect-error fulltext belongs to the full-text contribution
  db.public.Post.scopes.byViews.fulltext(q);
  // @ts-expect-error between belongs to the brin contribution
  db.public.Post.scopes.search.between(1, 2);
});

test('a scope operation returns the collection of the model', async () => {
  const rows = await db.public.Post.scopes.search
    .fulltext(q)
    .where((p) => p.views.gt(1))
    .select('id', 'title')
    .limit(10)
    .all();
  expectTypeOf(rows).toEqualTypeOf<{ id: number; title: string }[]>();

  const selectedFirst = await db.public.Post.select('id').scopes.search.fulltext(q).all();
  expectTypeOf(selectedFirst).toEqualTypeOf<{ id: number }[]>();

  db.public.Post.scopes.search
    .fulltext(q)
    // @ts-expect-error nope is not a field of Post
    .where((p) => p.nope.eq(1));
});

test('the scope is present on chained collections', () => {
  db.public.Post.where((p) => p.userId.eq(1))
    .scopes.search.fulltext(q)
    .orderBy((p) => p.id.desc())
    .scopes.search.fulltext(q)
    .scopes.byViews.between(1, 2)
    .limit(1);
});

test('the scope is present inside an include refinement', async () => {
  const users = await db.public.User.select('id')
    .include('posts', (posts) => posts.scopes.search.fulltext(q).select('id', 'title').limit(3))
    .all();
  expectTypeOf(users).toEqualTypeOf<{ id: number; posts: { id: number; title: string }[] }[]>();

  db.public.User.include('posts', (posts) =>
    // @ts-expect-error missing is not a scope of Post
    posts.scopes.missing.fulltext(q),
  );
});

test('a scope named like a collection member is reachable under scopes', () => {
  expectTypeOf(db.public.Post.where).toBeFunction();
  expectTypeOf(db.public.Post.scopes.where.fulltext).toBeFunction();
  // @ts-expect-error where is the collection method, not the scope
  db.public.Post.where.fulltext(q);
});

test('a model with no declared scopes has an empty scopes object', () => {
  // biome-ignore lint/complexity/noBannedTypes: the empty object type is the assertion
  expectTypeOf(db.public.User.scopes).toEqualTypeOf<{}>();
  expectTypeOf<keyof typeof db.public.User.scopes>().toBeNever();
  // @ts-expect-error User declares no scopes
  db.public.User.scopes.search;
});

class PostCollection extends Collection<ScopedContract, 'Post'> {
  published() {
    return this.where((post) => post.views.gte(100));
  }

  relevant(query: FakeTsQuery) {
    return this.scopes.search.fulltext(query).limit(5);
  }
}

const custom = orm({ runtime, context, collections: { Post: PostCollection } });

test('a custom collection class has scopes, inside the class and after a chained call', () => {
  expectTypeOf(custom.public.Post.published).toBeFunction();
  expectTypeOf(custom.public.Post.scopes.published.fulltext).toBeFunction();
  expectTypeOf(custom.public.Post.relevant).returns.not.toBeAny();
  custom.public.Post.relevant(q).scopes.search.fulltext(q);
  custom.public.Post.where({ id: 1 }).scopes.search.fulltext(q).limit(1);
});
