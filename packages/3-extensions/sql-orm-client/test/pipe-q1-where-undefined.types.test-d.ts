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

class OptionalPosts extends Collection<SoftDeleteContract, 'Post'> {
  search(term: string | undefined) {
    return this.where(term ? (p) => p.title.eq(term) : undefined);
  }
}

test('where and orderBy accept undefined and keep the state', () => {
  const f = Post.where(search ? (p) => p.title.eq(search) : undefined)
    .orderBy(sort ? (p) => p.id[sort]() : undefined)
    .limit(10);
  expectTypeOf(f).toEqualTypeOf<ReturnType<(typeof Post)['limit']>>();
  // @ts-expect-error update stays locked
  f.update({ title: 'x' });
  // @ts-expect-error cursor stays locked
  f.cursor({ id: 1 });
  const shorthand = Post.where(search ? { title: search } : undefined);
  expectTypeOf(shorthand).toEqualTypeOf<ReturnType<(typeof Post)['limit']>>();
  expectTypeOf(Post.where((p) => p.title.eq('x')).update({ title: 'y' })).not.toBeAny();
  const customResult = custom.public.Post.where(search ? { title: search } : undefined);
  // @ts-expect-error where returns the base collection type, as today
  customResult.popular();
  expectTypeOf(customResult).not.toEqualTypeOf<SoftPostCollection>();
  expectTypeOf((null as unknown as OptionalPosts).search('x').limit(1)).not.toBeAny();
  const users = db.public.User.include('posts', (posts) =>
    posts.where(search ? { title: search } : undefined).limit(2),
  ).all();
  expectTypeOf(users).not.toBeAny();
});
