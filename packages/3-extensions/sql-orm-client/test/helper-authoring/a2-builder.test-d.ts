import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import { orm } from '../../src/orm';
import type { RuntimeQueryable } from '../../src/types';
import { fulltextSearchScopes } from './a2-builder';
import { type FakeTsQuery, fakeTsQuery, type HelperContract } from './fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<HelperContract>;
const db = orm({ runtime, context });
const q = fakeTsQuery('hello');

test('infers the matched indexes and the argument list with no annotations', async () => {
  const scopes = fulltextSearchScopes(db.public.Post);
  expectTypeOf(scopes).not.toBeAny();
  expectTypeOf<keyof typeof scopes>().toEqualTypeOf<
    'post_title_body_search' | 'post_title_search'
  >();
  expectTypeOf(scopes.post_title_search).parameters.toEqualTypeOf<
    [query: FakeTsQuery, options?: { readonly language?: string }]
  >();
  expectTypeOf(scopes.post_title_search(q)).toEqualTypeOf<typeof db.public.Post>();
  // @ts-expect-error a brin index is not a full-text index
  scopes.posts_views_brin;

  const chained = db.public.Post.where((p) => p.views.gt(1)).select('id');
  expectTypeOf(fulltextSearchScopes(chained).post_title_search(q)).toEqualTypeOf<typeof chained>();

  const users = await db.public.User.select('id')
    .include('posts', (posts) => fulltextSearchScopes(posts).post_title_search(q).select('id'))
    .all();
  expectTypeOf(users).toEqualTypeOf<{ id: number; posts: { id: number }[] }[]>();
  expectTypeOf<
    keyof ReturnType<typeof fulltextSearchScopes<typeof db.public.User>>
  >().toEqualTypeOf<never>();
});
