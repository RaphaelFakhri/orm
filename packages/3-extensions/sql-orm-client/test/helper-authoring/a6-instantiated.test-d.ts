import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import { Collection } from '../../src/collection';
import { orm } from '../../src/orm';
import type { RuntimeQueryable } from '../../src/types';
import { fulltextSearchScopes } from './a6-instantiated';
import { type FakeTsQuery, fakeTsQuery, type HelperContract } from './fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<HelperContract>;
const db = orm({ runtime, context });
const q = fakeTsQuery('hello');

test('offers only the matching indexes, under their authored names', () => {
  const scopes = fulltextSearchScopes(db.public.Post);
  expectTypeOf(scopes).not.toBeAny();
  expectTypeOf<keyof typeof scopes>().toEqualTypeOf<
    'post_title_body_search' | 'post_title_search'
  >();
  // @ts-expect-error the physical name is not a member
  scopes.post_title_body_search_0a1b2c3d;
  // @ts-expect-error a btree index is not a full-text index
  scopes.posts_user_id_idx;
  // @ts-expect-error a brin index is not a full-text index
  scopes.posts_views_brin;
});

test('returns the input collection type on a root collection', () => {
  const result = fulltextSearchScopes(db.public.Post).post_title_body_search(q);
  expectTypeOf(result).toEqualTypeOf<typeof db.public.Post>();
});

test('derives option types from the literal index', () => {
  const scopes = fulltextSearchScopes(db.public.Post);
  expectTypeOf(scopes.post_title_body_search).parameters.toEqualTypeOf<
    [query: FakeTsQuery, options?: { readonly only?: 'title' | 'subtitle' | 'body' }]
  >();
  scopes.post_title_body_search(q, { only: 'subtitle' });
  scopes.post_title_search(q, { only: 'title' });
  // @ts-expect-error body is not a field of post_title_search
  scopes.post_title_search(q, { only: 'body' });
  // @ts-expect-error views is not a field of the index
  scopes.post_title_body_search(q, { only: 'views' });
  // @ts-expect-error a plain string is not a query
  scopes.post_title_body_search('hello');
});

test('keeps the exact type of a chained collection', async () => {
  const chained = db.public.Post.where((p) => p.views.gt(1)).select('id', 'title');
  const result = fulltextSearchScopes(chained).post_title_search(q);
  expectTypeOf(result).toEqualTypeOf<typeof chained>();
  const rows = await result.limit(10).all();
  expectTypeOf(rows).toEqualTypeOf<{ id: number; title: string }[]>();
});

test('works on the collection inside an include refinement', async () => {
  const users = await db.public.User.select('id')
    .include('posts', (posts) =>
      fulltextSearchScopes(posts)
        .post_title_body_search(q, { only: 'title' })
        .select('id')
        .limit(3),
    )
    .all();
  expectTypeOf(users).toEqualTypeOf<{ id: number; posts: { id: number }[] }[]>();
});

test('a model with no full-text index gets no members', () => {
  expectTypeOf<
    keyof ReturnType<typeof fulltextSearchScopes<typeof db.public.User>>
  >().toEqualTypeOf<never>();
});

class PostCollection extends Collection<HelperContract, 'Post'> {
  published() {
    return this.where((p) => p.views.gt(0));
  }

  relevantThis(query: FakeTsQuery) {
    // @ts-expect-error the keys of a mapped type over the polymorphic this type are not known
    return fulltextSearchScopes(this).post_title_search(query);
  }

  relevant(query: FakeTsQuery) {
    return fulltextSearchScopes<PostCollection>(this).post_title_search(query);
  }
}

test('works on this inside a custom collection class when the class names itself', () => {
  const custom = orm({ runtime, context, collections: { Post: PostCollection } });
  const result = custom.public.Post.relevant(q);
  expectTypeOf(result).toEqualTypeOf<PostCollection>();
  expectTypeOf(result.published).toBeFunction();
  expectTypeOf(fulltextSearchScopes(custom.public.Post).post_title_search(q)).toEqualTypeOf<
    typeof custom.public.Post
  >();
});
