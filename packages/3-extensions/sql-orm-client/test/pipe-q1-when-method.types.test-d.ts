import { expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import {
  type SoftDeleteContract,
  type SoftPostCollection,
  softDeleteSetup,
} from './pipe-fragments-fixture';

const { db, custom } = softDeleteSetup();
const Post = db.public.Post;

declare const search: string | undefined;
declare const sort: 'asc' | 'desc' | undefined;

class WhenPosts extends Collection<SoftDeleteContract, 'Post'> {
  search(term: string | undefined) {
    return this.when(term, (c, t) => c.where((p) => p.title.eq(t)));
  }
}

test('when as a method', () => {
  const d = Post.when(search, (c, s) => c.where((p) => p.title.eq(s)))
    .when(sort, (c, dir) => c.orderBy((p) => p.id[dir]()))
    .limit(10);
  expectTypeOf(d).toEqualTypeOf<ReturnType<(typeof Post)['limit']>>();
  // @ts-expect-error update stays locked
  d.update({ title: 'x' });
  expectTypeOf(
    custom.public.Post.when(search, (c, s) => c.where({ title: s })),
  ).toEqualTypeOf<SoftPostCollection>();
  expectTypeOf((null as unknown as WhenPosts).search('x')).toEqualTypeOf<WhenPosts>();
  const users = db.public.User.include('posts', (posts) =>
    posts.when(search, (c, s) => c.where({ title: s })).limit(2),
  ).all();
  expectTypeOf(users).not.toBeAny();
  // @ts-expect-error select changes the row
  Post.when(search, (c) => c.select('id'));
});
