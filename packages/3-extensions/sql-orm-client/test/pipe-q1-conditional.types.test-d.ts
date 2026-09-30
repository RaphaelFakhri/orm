import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import type { HasOrderBy, HasWhere } from '../src/collection-internal-types';
import { when } from '../src/pipe-fragments';
import {
  type SoftDeleteContract,
  type SoftPostCollection,
  softDeleteSetup,
} from './pipe-fragments-fixture';

const { db, custom } = softDeleteSetup();
const Post = db.public.Post;

declare const search: string | undefined;
declare const sort: 'asc' | 'desc' | undefined;
declare const flag: boolean;

type Base = typeof Post;
type Filtered = Base & HasWhere;
type Ordered = Base & HasOrderBy;
type CustomFiltered = SoftPostCollection & HasWhere;

class ConditionalPosts extends Collection<SoftDeleteContract, 'Post'> {
  search(term: string | undefined) {
    return this.pipe(when(term, (c, t) => c.where((p) => p.title.eq(t))));
  }
  plainConditional(term: string | undefined) {
    return this.pipe((c) => (term ? c.where((p) => p.title.eq(term)) : c));
  }
}

describe('a: conditional steps inside pipe', () => {
  test('the result collapses to the unfiltered type', () => {
    const a = Post.pipe((c) => (search ? c.where((p) => p.title.eq(search)) : c))
      .pipe((c) => (sort ? c.orderBy((p) => p.id[sort]()) : c))
      .limit(10);
    expectTypeOf(a).toEqualTypeOf<Base>();
    expectTypeOf(a).not.toBeAny();
    expectTypeOf(a.where((p) => p.views.gt(1))).toEqualTypeOf<Filtered>();
    expectTypeOf(a.orderBy((p) => p.id.asc())).toEqualTypeOf<Ordered>();
    expectTypeOf(a.select('id', 'title').all()).not.toBeAny();
    expectTypeOf(a.include('author').all()).not.toBeAny();
    expectTypeOf(a.first()).toEqualTypeOf<ReturnType<Base['first']>>();
    // @ts-expect-error the filter may not have been applied, so update stays locked
    a.update({ title: 'x' });
    // @ts-expect-error the filter may not have been applied, so delete stays locked
    a.delete();
    // @ts-expect-error the order may not have been applied, so cursor stays locked
    a.cursor({ id: 1 });
  });

  test('pipe is not needed for the collapse: a bare conditional does the same', () => {
    const bare = search ? Post.where((p) => p.title.eq(search)) : Post;
    expectTypeOf(bare).toEqualTypeOf<Base>();
  });

  test('with this-typed chaining, a custom class reduces to the class', () => {
    const c = custom.public.Post.pipe((q) => (search ? q.where((p) => p.title.eq(search)) : q));
    expectTypeOf(c).toEqualTypeOf<SoftPostCollection>();
    expectTypeOf(c.popular()).not.toBeAny();
    // @ts-expect-error update is locked
    c.update({ title: 'x' });
    const bare = search ? custom.public.Post.where((p) => p.title.eq(search)) : custom.public.Post;
    expectTypeOf(bare).toEqualTypeOf<SoftPostCollection>();
    expectTypeOf<CustomFiltered>().toExtend<SoftPostCollection>();
  });

  test('with a checked state, where in one branch and orderBy in the other keeps a union', () => {
    const x = flag ? Post.where({ id: 1 }) : Post.orderBy((p) => p.id.asc());
    expectTypeOf(x).toEqualTypeOf<Filtered | Ordered>();
    // @ts-expect-error update is locked on one member
    x.update({ title: 'x' });
  });

  test('with include inferring the state from this, a union with the root type keeps include', () => {
    const y = Post as Base | Filtered;
    expectTypeOf(y.where({ id: 1 })).not.toBeAny();
    expectTypeOf(y.orderBy((p) => p.id.asc())).not.toBeAny();
    expectTypeOf(y.select('id')).not.toBeAny();
    expectTypeOf(y.limit(1).all()).not.toBeAny();
    expectTypeOf(y.first()).not.toBeAny();
    expectTypeOf(y.include('author').all()).not.toBeAny();
    const z = Post as Base | Ordered;
    expectTypeOf(z.include('author').all()).not.toBeAny();
  });
});

describe('b: the plain chain with let', () => {
  test('a plain collection keeps its declared type', () => {
    let q = Post;
    if (search) q = q.where((p) => p.title.eq(search));
    if (sort) q = q.orderBy((p) => p.id[sort]());
    expectTypeOf(q.limit(10).all()).toEqualTypeOf<ReturnType<Base['all']>>();
    expectTypeOf(q.include('author').all()).not.toBeAny();
    // @ts-expect-error update stays locked
    q.update({ title: 'x' });
  });

  test('a custom class takes the filtered collection back', () => {
    let q = custom.public.Post;
    if (search) q = q.where((p) => p.title.eq(search));
    q.popular();
  });

  test('with a checked state, assignment checks the type state', () => {
    // @ts-expect-error TS2322: the root collection has no filter
    const unfiltered: Filtered = Post;
    expectTypeOf(unfiltered).not.toBeAny();
  });
});

describe('c: unconditional steps', () => {
  test('the type state records each step', () => {
    const c = Post.where((p) => p.title.eq('x'))
      .orderBy((p) => p.id.asc())
      .limit(10);
    expectTypeOf(c.cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(c.update({ title: 'y' })).not.toBeAny();
  });
});

describe('d: when', () => {
  test('root collection', () => {
    const d = Post.pipe(when(search, (c, s) => c.where((p) => p.title.eq(s))))
      .pipe(when(sort, (c, dir) => c.orderBy((p) => p.id[dir]())))
      .limit(10);
    expectTypeOf(d).toEqualTypeOf<Base>();
    expectTypeOf(d.include('author').all()).not.toBeAny();
    expectTypeOf(d.select('id').first()).not.toBeAny();
    // @ts-expect-error update stays locked
    d.update({ title: 'x' });
    // @ts-expect-error cursor stays locked
    d.cursor({ id: 1 });
  });

  test('chained collection keeps its state', () => {
    const chained = Post.where({ userId: 1 }).orderBy((p) => p.id.asc());
    const d = chained.pipe(when(search, (c, s) => c.where((p) => p.title.eq(s))));
    expectTypeOf(d).toEqualTypeOf<typeof chained>();
    expectTypeOf(d.cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(d.update({ title: 'y' })).not.toBeAny();
  });

  test('custom class keeps its methods', () => {
    const d = custom.public.Post.pipe(when(search, (c, s) => c.where((p) => p.title.eq(s))));
    expectTypeOf(d).toEqualTypeOf<SoftPostCollection>();
    expectTypeOf(d.popular()).not.toBeAny();
    // @ts-expect-error update stays locked
    d.update({ title: 'x' });
  });

  test('this inside a custom class', () => {
    const instance = null as unknown as ConditionalPosts;
    expectTypeOf(instance.search('x')).toEqualTypeOf<ConditionalPosts>();
    expectTypeOf(instance.plainConditional('x')).toEqualTypeOf<ConditionalPosts>();
  });

  test('include refinement', () => {
    const users = db.public.User.include('posts', (posts) =>
      posts.pipe(when(search, (c, s) => c.where((p) => p.title.eq(s)))).limit(3),
    ).all();
    expectTypeOf(users).not.toBeAny();
  });

  test('a step that changes the row is rejected', () => {
    // @ts-expect-error select changes the row
    Post.pipe(when(search, (c) => c.select('id')));
  });
});
