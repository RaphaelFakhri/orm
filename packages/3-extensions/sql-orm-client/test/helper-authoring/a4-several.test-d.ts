import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import { orm } from '../../src/orm';
import type { RuntimeQueryable } from '../../src/types';
import { fulltextSearchScopes as placeholderScopes } from './a4-several';
import { fulltextSearchScopes as instantiatedScopes } from './a4-several-instantiated';
import { type FakeTsQuery, fakeTsQuery, type HelperContract } from './fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<HelperContract>;
const db = orm({ runtime, context });
const q = fakeTsQuery('hello');

test('placeholder builder: several operations per index', () => {
  const scopes = placeholderScopes(db.public.Post);
  expectTypeOf<keyof typeof scopes>().toEqualTypeOf<
    'post_title_body_search' | 'post_title_search'
  >();
  expectTypeOf<keyof typeof scopes.post_title_search>().toEqualTypeOf<'fulltext' | 'phrase'>();
  expectTypeOf(scopes.post_title_body_search.fulltext(q)).toEqualTypeOf<typeof db.public.Post>();
  expectTypeOf(scopes.post_title_body_search.phrase).parameters.toEqualTypeOf<
    [query: FakeTsQuery]
  >();
  scopes.post_title_search.fulltext(q, { only: 'title' });
  // @ts-expect-error body is not a field of post_title_search
  scopes.post_title_search.fulltext(q, { only: 'body' });
});

test('instantiated kind: several operations per index', async () => {
  const chained = db.public.Post.where((p) => p.views.gt(1)).select('id');
  const scopes = instantiatedScopes(chained);
  expectTypeOf<keyof typeof scopes>().toEqualTypeOf<
    'post_title_body_search' | 'post_title_search'
  >();
  expectTypeOf<keyof typeof scopes.post_title_search>().toEqualTypeOf<'fulltext' | 'phrase'>();
  expectTypeOf(scopes.post_title_body_search.phrase(q)).toEqualTypeOf<typeof chained>();
  expectTypeOf(scopes.post_title_body_search.fulltext).parameters.toEqualTypeOf<
    [query: FakeTsQuery, options?: { readonly only?: 'title' | 'subtitle' | 'body' }]
  >();
  // @ts-expect-error body is not a field of post_title_search
  scopes.post_title_search.fulltext(q, { only: 'body' });
  const users = await db.public.User.select('id')
    .include('posts', (posts) => instantiatedScopes(posts).post_title_search.phrase(q).select('id'))
    .all();
  expectTypeOf(users).toEqualTypeOf<{ id: number; posts: { id: number }[] }[]>();
});
