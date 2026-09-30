import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import type { HasWhere } from '../src/collection-internal-types';
import { orm } from '../src/orm';
import { createMockRuntime, getTestContext, type TestContract } from './helpers';

declare const flag: boolean;

class PostCollection extends Collection<TestContract, 'Post'> {
  published() {
    return this.where((p) => p.views.gte(100));
  }
  recent() {
    return this.orderBy((p) => p.views.desc());
  }
  maybePublished(only: boolean) {
    return only ? this.where((p) => p.views.gte(100)) : this;
  }
  maybePublishedViaPipe(only: boolean) {
    return this.pipe((c) => (only ? c.published() : c));
  }
  publishedViaPipe() {
    return this.pipe((c) => c.published());
  }
}

class UserCollection extends Collection<TestContract, 'User'> {
  named(name: string) {
    return this.where((u) => u.name.eq(name));
  }
}

const db = orm({
  runtime: createMockRuntime(),
  context: getTestContext(),
  collections: { Post: PostCollection, User: UserCollection },
});
const Post = db.public.Post;
const plain = orm({ runtime: createMockRuntime(), context: getTestContext() }).public.Post;
const plainWithAuthor = plain.include('author');
type PlainAuthorRow = NonNullable<Awaited<ReturnType<typeof plainWithAuthor.first>>>;
const plainWithAuthorComments = plainWithAuthor.include('comments');
type PlainAuthorCommentsRow = NonNullable<
  Awaited<ReturnType<typeof plainWithAuthorComments.first>>
>;

describe('the class survives chaining', () => {
  test('custom method after a custom method', () => {
    const r = Post.published().recent();
    expectTypeOf(r).not.toBeAny();
    expectTypeOf(r).toExtend<PostCollection>();
    expectTypeOf(r.all()).not.toBeAny();
  });

  test('custom method after where', () => {
    expectTypeOf(Post.where((p) => p.views.gt(1)).published()).toExtend<PostCollection>();
  });

  test('custom method after include keeps the class and the widened row', async () => {
    const c = Post.include('author').published();
    expectTypeOf(c).toExtend<PostCollection>();
    const row = await c.first();
    expectTypeOf(row).toEqualTypeOf<PlainAuthorRow | null>();
    expectTypeOf<keyof NonNullable<typeof row>>().toEqualTypeOf<
      'id' | 'title' | 'userId' | 'embedding' | 'views' | 'author'
    >();
    expectTypeOf(await c.all()).toEqualTypeOf<PlainAuthorRow[]>();
  });

  test('custom method on the related class inside an include refinement', () => {
    // @ts-expect-error the refinement collection is not the registered class
    db.public.User.include('posts', (posts) => posts.published());
  });

  test('long chains keep the class and do not repeat the flags', () => {
    const r = Post.published().recent().limit(10).offset(1).distinct('title').published();
    expectTypeOf(r).toExtend<PostCollection>();
    expectTypeOf(r.recent().published()).toEqualTypeOf(r);
    expectTypeOf(r.update({ title: 'x' })).not.toBeAny();
    expectTypeOf(r.cursor({ id: 1 })).toExtend<PostCollection>();
  });

  test('pipe keeps the class', () => {
    expectTypeOf(Post.pipe((c) => c.published()).recent()).toExtend<PostCollection>();
    expectTypeOf(Post.publishedViaPipe().recent()).toExtend<PostCollection>();
    expectTypeOf(Post.publishedViaPipe().update({ title: 'x' })).not.toBeAny();
  });
});

describe('guards read the flags from this', () => {
  test('writes are refused on the class root', () => {
    // @ts-expect-error update needs a where
    Post.update({ title: 'x' });
    // @ts-expect-error updateAll needs a where
    Post.updateAll({ title: 'x' });
    // @ts-expect-error delete needs a where
    Post.delete();
    // @ts-expect-error deleteAll needs a where
    Post.deleteAll();
    // @ts-expect-error updateAndCount needs a where
    Post.updateAndCount({ title: 'x' });
    // @ts-expect-error deleteAndCount needs a where
    Post.deleteAndCount();
  });

  test('writes are allowed after a custom filter', () => {
    const p = Post.published();
    expectTypeOf(p.update({ title: 'x' })).not.toBeAny();
    expectTypeOf(p.updateAll({ title: 'x' })).not.toBeAny();
    expectTypeOf(p.delete()).not.toBeAny();
    expectTypeOf(p.deleteAll()).not.toBeAny();
    expectTypeOf(p.updateAndCount({ title: 'x' })).not.toBeAny();
    expectTypeOf(p.deleteAndCount()).not.toBeAny();
  });

  test('writes stay allowed after limit, select and include', () => {
    expectTypeOf(Post.published().limit(1).delete()).not.toBeAny();
    expectTypeOf(Post.published().select('id').update({ title: 'x' })).not.toBeAny();
    expectTypeOf(Post.published().include('author').deleteAll()).not.toBeAny();
  });

  test('cursor is refused until an order is set', () => {
    // @ts-expect-error cursor needs an orderBy
    Post.cursor({ id: 1 });
    // @ts-expect-error cursor needs an orderBy
    Post.published().cursor({ id: 1 });
    expectTypeOf(Post.recent().cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(Post.orderBy((p) => p.id.asc()).cursor({ id: 1 })).not.toBeAny();
  });

  test('the plain collection keeps its guards', () => {
    // @ts-expect-error update needs a where
    plain.update({ title: 'x' });
    // @ts-expect-error delete needs a where
    plain.delete();
    // @ts-expect-error cursor needs an orderBy
    plain.cursor({ id: 1 });
    expectTypeOf(plain.where((p) => p.id.eq(1)).update({ title: 'x' })).not.toBeAny();
    expectTypeOf(plain.where((p) => p.id.eq(1)).delete()).not.toBeAny();
    expectTypeOf(plain.orderBy((p) => p.id.asc()).cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(plain.where((p) => p.id.eq(1)).prepared).not.toBeAny();
  });
});

describe('conditionals reduce to the class', () => {
  test('a ternary inside a class method reduces to this', () => {
    const r = Post.maybePublished(flag);
    expectTypeOf(r).toEqualTypeOf<PostCollection>();
    expectTypeOf(r.recent().all()).not.toBeAny();
    // @ts-expect-error update needs a where
    r.update({ title: 'x' });
    // @ts-expect-error delete needs a where
    r.delete();
  });

  test('a ternary at the call site reduces to the class', () => {
    const r = flag ? Post.published() : Post;
    expectTypeOf(r).toEqualTypeOf<PostCollection>();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    // @ts-expect-error update needs a where
    r.update({ title: 'x' });
    // @ts-expect-error deleteAll needs a where
    r.deleteAll();
  });

  test('a ternary in pipe reduces to the class', () => {
    expectTypeOf(Post.pipe((c) => (flag ? c.published() : c))).toEqualTypeOf<PostCollection>();
    expectTypeOf(Post.maybePublishedViaPipe(flag)).toEqualTypeOf<PostCollection>();
  });

  test('let with if compiles', () => {
    let q = Post;
    if (flag) q = q.published();
    if (flag) q = q.recent().limit(3);
    expectTypeOf(q).toEqualTypeOf<PostCollection>();
    // @ts-expect-error update needs a where
    q.update({ title: 'x' });
  });

  test('where against orderBy on the class stays a union of the class', () => {
    const r = flag ? Post.published() : Post.recent();
    expectTypeOf(r).toEqualTypeOf<
      ReturnType<PostCollection['published']> | ReturnType<PostCollection['recent']>
    >();
    expectTypeOf(r.limit(1).all()).not.toBeAny();
    expectTypeOf(r.published().recent()).toExtend<PostCollection>();
    expectTypeOf(r.select('id').all()).not.toBeAny();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    // @ts-expect-error cursor needs an orderBy on every branch
    r.cursor({ id: 1 });
    // @ts-expect-error update needs a where
    r.update({ title: 'x' });
  });
});

describe('assignability', () => {
  test('a filtered class instance is a Collection', () => {
    const take = (c: Collection<TestContract, 'Post'>) => c;
    take(Post.published());
    take(Post.published().recent().limit(1));
  });

  test('a bare Collection is not a PostCollection', () => {
    const take = (c: PostCollection) => c;
    // @ts-expect-error the plain collection lacks the custom methods
    take(plain);
  });
});

describe('row-changing methods', () => {
  test('select keeps the flags but not the class', () => {
    const r = Post.published().select('id', 'title');
    expectTypeOf(r.update({ title: 'x' })).not.toBeAny();
    // @ts-expect-error the class does not survive select
    r.published();
  });

  test('include after where keeps the class, the flag and the widened row', async () => {
    const c = Post.published().include('author');
    expectTypeOf(c).toExtend<PostCollection & HasWhere>();
    expectTypeOf(await c.all()).toEqualTypeOf<PlainAuthorRow[]>();
    expectTypeOf(await c.delete()).toEqualTypeOf<PlainAuthorRow | null>();
    expectTypeOf(await c.update({ title: 'x' })).toEqualTypeOf<PlainAuthorRow | null>();
    expectTypeOf(c.published().recent()).toExtend<PostCollection>();
  });

  test('update after where then include returns the widened row', async () => {
    const c = Post.where((p) => p.id.eq(1)).include('author');
    expectTypeOf(await c.update({ title: 'x' })).toEqualTypeOf<PlainAuthorRow | null>();
  });

  test('chained includes widen twice', async () => {
    const c = Post.include('author').published().include('comments');
    expectTypeOf(c).toExtend<PostCollection>();
    expectTypeOf(await c.first()).toEqualTypeOf<PlainAuthorCommentsRow | null>();
  });

  test('select after include still narrows and keeps the relation', async () => {
    const c = Post.include('author').published().select('id');
    expectTypeOf(await c.first()).toEqualTypeOf<{
      id: number;
      author: PlainAuthorRow['author'];
    } | null>();
    expectTypeOf(await c.update({ title: 'x' })).not.toBeAny();
  });

  test('the included relation has the row of the related model', () => {
    expectTypeOf<PlainAuthorRow['author']>().toEqualTypeOf<{
      name: string;
      id: number;
      invitedById: number | null;
      address: {
        readonly city: string;
        readonly street: string;
        readonly zip: string | null;
      } | null;
      email: string;
    }>();
    expectTypeOf<keyof PlainAuthorCommentsRow>().toEqualTypeOf<
      'id' | 'title' | 'userId' | 'embedding' | 'views' | 'author' | 'comments'
    >();
  });

  test('inside a refinement, include then orderBy keeps the widened row', async () => {
    const c = db.public.User.include('posts', (posts) =>
      posts.include('comments').orderBy((p) => p.id.asc()),
    );
    const row = await c.first();
    expectTypeOf(row!.posts[0]!.comments).not.toBeAny();
    expectTypeOf<keyof NonNullable<typeof row>['posts'][number]>().toEqualTypeOf<
      'id' | 'title' | 'userId' | 'embedding' | 'views' | 'comments'
    >();
  });

  test('plain collection rows are unchanged', async () => {
    expectTypeOf(await plain.first()).toEqualTypeOf<{
      id: number;
      title: string;
      userId: number;
      embedding: number[] | null;
      views: number;
    } | null>();
  });
});
