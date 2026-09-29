import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { orm } from '../../src/orm';
import type { RuntimeQueryable } from '../../src/types';
import { fulltextSearchScopes as h } from './a4-several';
import { fakeTsQuery, type HelperContract } from './fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<HelperContract>;
const db = orm({ runtime, context });
const q = fakeTsQuery('x');

h(db.public.Post).post_title_body_search.fulltext(q);
h(db.public.Post).post_title_search.fulltext(q, { only: 'title' });
h(db.public.Post.where((p) => p.views.gt(1))).post_title_body_search.fulltext(q, {
  only: 'body',
});
h(db.public.Post.select('id')).post_title_search.fulltext(q);
h(db.public.Post.orderBy((p) => p.id.desc()))
  .post_title_body_search.fulltext(q)
  .limit(3);
db.public.User.include('posts', (posts) => h(posts).post_title_search.fulltext(q));
db.public.User.include('posts', (posts) =>
  h(posts).post_title_body_search.fulltext(q, { only: 'subtitle' }).select('id'),
);
h(h(db.public.Post).post_title_search.fulltext(q)).post_title_body_search.fulltext(q);
h(db.public.Post.where((p) => p.id.eq(1)).select('id', 'title'))
  .post_title_search.fulltext(q)
  .all();
h(db.public.Post.limit(5)).post_title_body_search.fulltext(q, { only: 'title' }).first();
