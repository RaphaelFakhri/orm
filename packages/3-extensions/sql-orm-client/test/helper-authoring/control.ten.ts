import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { orm } from '../../src/orm';
import type { RuntimeQueryable } from '../../src/types';
import type { HelperContract } from './fixture';

declare const runtime: RuntimeQueryable;
declare const context: ExecutionContext<HelperContract>;
const db = orm({ runtime, context });

db.public.Post;
db.public.Post;
db.public.Post.where((p) => p.views.gt(1));
db.public.Post.select('id');
db.public.Post.orderBy((p) => p.id.desc()).limit(3);
db.public.User.include('posts', (posts) => posts);
db.public.User.include('posts', (posts) => posts.select('id'));
db.public.Post;
db.public.Post.where((p) => p.id.eq(1))
  .select('id', 'title')
  .all();
db.public.Post.limit(5).first();
