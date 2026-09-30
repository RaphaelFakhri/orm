import { describe, expectTypeOf, test } from 'vitest';
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
declare const flag: boolean;
declare const mode: 'title' | 'views' | 'none';
declare const terms: readonly string[];

type Base = typeof Post;
type Filtered = ReturnType<Base['where']>;
type Ordered = ReturnType<Base['orderBy']>;
type FilteredOrdered = ReturnType<Filtered['orderBy']>;
const selectedPost = Post.select('id', 'title');
type Selected = typeof selectedPost;

function expectReadsWork(c: Base) {
  expectTypeOf(c.where((p) => p.views.gt(1))).not.toBeAny();
  expectTypeOf(c.orderBy((p) => p.id.asc())).not.toBeAny();
  expectTypeOf(c.select('id', 'title').all()).not.toBeAny();
  expectTypeOf(c.include('author').all()).not.toBeAny();
  expectTypeOf(c.limit(1).all()).not.toBeAny();
  expectTypeOf(c.first()).not.toBeAny();
  expectTypeOf(c.all()).not.toBeAny();
}

describe('a: search ? c.where(...) : c', () => {
  test('root collection reduces to the unfiltered type', () => {
    const r = search ? Post.where((p) => p.title.eq(search)) : Post;
    expectTypeOf(r).toEqualTypeOf<Base>();
    const reversed = search ? Post : Post.where((p) => p.title.eq(search ?? ''));
    expectTypeOf(reversed).toEqualTypeOf<Base>();
    expectReadsWork(r);
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error updateAll is locked
    r.updateAll({ title: 'x' });
    // @ts-expect-error delete is locked
    r.delete();
    // @ts-expect-error deleteAll is locked
    r.deleteAll();
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('after where: both branches are filtered, so update and delete stay unlocked', () => {
    const c = Post.where({ userId: 1 });
    const r = search ? c.where((p) => p.title.eq(search)) : c;
    expectTypeOf(r).toEqualTypeOf<Filtered>();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    expectTypeOf(r.update({ title: 'x' })).not.toBeAny();
    expectTypeOf(r.delete()).not.toBeAny();
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('after where and orderBy on one branch only, cursor stays locked', () => {
    const c = Post.where({ userId: 1 });
    const r = sort ? c.orderBy((p) => p.id[sort]()) : c;
    expectTypeOf(r).toEqualTypeOf<Filtered>();
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('after select', () => {
    const c = Post.select('id', 'title');
    const r = search ? c.where((p) => p.title.eq(search)) : c;
    expectTypeOf(r).toEqualTypeOf<Selected>();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    expectTypeOf(r.first()).not.toBeAny();
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error delete is locked
    r.delete();
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('include refinement', () => {
    const users = db.public.User.include('posts', (posts) => {
      const r = search ? posts.where((p) => p.title.eq(search)) : posts;
      expectTypeOf(r).toEqualTypeOf<typeof posts>();
      expectTypeOf(r.include('author')).not.toBeAny();
      expectTypeOf(r.orderBy((p) => p.id.asc())).not.toBeAny();
      // @ts-expect-error cursor is locked
      r.cursor({ id: 1 });
      return r.limit(3);
    }).all();
    expectTypeOf(users).not.toBeAny();
  });

  test('inside pipe', () => {
    const r = Post.pipe((c) => (search ? c.where((p) => p.title.eq(search)) : c));
    expectTypeOf(r).toEqualTypeOf<Base>();
    expectReadsWork(r);
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('a custom class root reduces to the class: include works, update is refused', () => {
    const r = search ? custom.public.Post.where((p) => p.title.eq(search)) : custom.public.Post;
    expectTypeOf(r).toEqualTypeOf<SoftPostCollection>();
    expectTypeOf(r.where({ id: 1 })).not.toBeAny();
    expectTypeOf(r.first()).not.toBeAny();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    expectTypeOf(r.popular()).not.toBeAny();
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error delete is locked
    r.delete();
  });
});

describe('b: where in one branch, orderBy in the other', () => {
  test('root collection: neither branch is a subtype of the other, so the union survives', () => {
    const x = flag ? Post.where({ id: 1 }) : Post.orderBy((p) => p.id.asc());
    expectTypeOf(x).toEqualTypeOf<Filtered | Ordered>();
    expectTypeOf(x.where({ id: 2 })).not.toBeAny();
    expectTypeOf(x.first()).not.toBeAny();
    // @ts-expect-error TS2349: the union members' include signatures are not compatible
    x.include('author');
    // @ts-expect-error update is locked
    x.update({ title: 'x' });
    // @ts-expect-error delete is locked
    x.delete();
    // @ts-expect-error cursor is locked
    x.cursor({ id: 1 });
  });

  test('an annotation picks the root type', () => {
    const x: Base = flag ? Post.where({ id: 1 }) : Post.orderBy((p) => p.id.asc());
    expectTypeOf(x.include('author').all()).not.toBeAny();
    // @ts-expect-error update is locked
    x.update({ title: 'x' });
  });

  test('inside pipe', () => {
    const x = Post.pipe((c) => (flag ? c.where({ id: 1 }) : c.orderBy((p) => p.id.asc())));
    expectTypeOf(x).toEqualTypeOf<Filtered | Ordered>();
    // @ts-expect-error update is locked
    x.update({ title: 'x' });
    // @ts-expect-error cursor is locked
    x.cursor({ id: 1 });
  });
});

describe('c: let and if', () => {
  test('a plain collection', () => {
    let q = Post;
    if (search) q = q.where((p) => p.title.eq(search));
    if (sort) q = q.orderBy((p) => p.id[sort]());
    expectTypeOf(q).toEqualTypeOf<Base>();
    expectTypeOf(q.include('author').all()).not.toBeAny();
    // @ts-expect-error update is locked
    q.update({ title: 'x' });
    // @ts-expect-error cursor is locked
    q.cursor({ id: 1 });
  });

  test('after select', () => {
    let q = Post.select('id', 'title');
    if (search) q = q.where((p) => p.title.eq(search));
    expectTypeOf(q.first()).not.toBeAny();
    // @ts-expect-error update is locked
    q.update({ title: 'x' });
  });

  test('a custom class takes the filtered collection back', () => {
    let q = custom.public.Post;
    if (search) q = q.where((p) => p.title.eq(search));
    q.popular();
  });
});

describe('d: unconditional chains still unlock', () => {
  test('where unlocks update and delete', () => {
    const f = Post.where((p) => p.title.eq('x'));
    expectTypeOf(f.update({ title: 'y' })).not.toBeAny();
    expectTypeOf(f.updateAll({ title: 'y' })).not.toBeAny();
    expectTypeOf(f.delete()).not.toBeAny();
    expectTypeOf(f.deleteAll()).not.toBeAny();
    // @ts-expect-error cursor needs orderBy
    f.cursor({ id: 1 });
  });

  test('where then orderBy unlocks cursor', () => {
    const c = Post.where((p) => p.title.eq('x')).orderBy((p) => p.id.asc());
    expectTypeOf(c).toEqualTypeOf<FilteredOrdered>();
    expectTypeOf(c.cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(c.update({ title: 'y' })).not.toBeAny();
  });

  test('orderBy alone unlocks cursor', () => {
    const o: Ordered = Post.orderBy((p) => p.id.asc());
    expectTypeOf(o.cursor({ id: 1 })).not.toBeAny();
  });

  test('a filtered collection is accepted where the root type is expected', () => {
    const takesBase = (c: Base) => c.limit(1);
    expectTypeOf(takesBase(Post.where({ id: 1 }))).not.toBeAny();
    expectTypeOf(takesBase(Post.orderBy((p) => p.id.asc()))).not.toBeAny();
  });
});

describe('e: pipe with a function body', () => {
  test('if with early return', () => {
    const r = Post.pipe((c) => {
      if (search) return c.where((p) => p.title.eq(search));
      return c;
    });
    expectTypeOf(r).toEqualTypeOf<Base>();
    expectReadsWork(r);
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
  });

  test('switch', () => {
    const r = Post.pipe((c) => {
      switch (mode) {
        case 'title':
          return c.where((p) => p.title.eq('x'));
        case 'views':
          return c.orderBy((p) => p.views.desc());
        default:
          return c;
      }
    });
    expectTypeOf(r).toEqualTypeOf<Base>();
    expectReadsWork(r);
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
  });

  test('a loop of where calls', () => {
    const r = Post.pipe((c) => {
      let q = c;
      for (const term of terms) q = q.where((p) => p.title.eq(term));
      return q;
    });
    expectTypeOf(r).toEqualTypeOf<Base>();
    expectReadsWork(r);
    // @ts-expect-error update is locked: the loop may run zero times
    r.update({ title: 'x' });
  });

  test('every return is filtered: update unlocks', () => {
    const r = Post.pipe((c) => {
      if (search) return c.where((p) => p.title.eq(search));
      return c.where({ id: 1 });
    });
    expectTypeOf(r).toEqualTypeOf<Filtered>();
    expectTypeOf(r.update({ title: 'x' })).not.toBeAny();
  });
});

class ConditionalPosts extends Collection<SoftDeleteContract, 'Post'> {
  ternary(term: string | undefined) {
    return term ? this.where((p) => p.title.eq(term)) : this;
  }
  earlyReturn(term: string | undefined) {
    if (term) return this.where((p) => p.title.eq(term));
    return this;
  }
  viaPipe(term: string | undefined) {
    return this.pipe((c) => (term ? c.where((p) => p.title.eq(term)) : c));
  }
  letForm(term: string | undefined) {
    let q = this;
    if (term) q = q.where((p) => p.title.eq(term));
    return q;
  }
  letAnnotated(term: string | undefined) {
    let q: Collection<SoftDeleteContract, 'Post'> = this;
    if (term) q = q.where((p) => p.title.eq(term));
    return q;
  }
}

describe('f: custom class, this', () => {
  const instance = null as unknown as ConditionalPosts;
  test('the ternary reduces to the class', () => {
    const r = instance.ternary('x');
    expectTypeOf(r).toEqualTypeOf<ConditionalPosts>();
    expectTypeOf(r.where({ id: 1 })).not.toBeAny();
    expectTypeOf(r.orderBy((p) => p.id.asc())).not.toBeAny();
    expectTypeOf(r.select('id')).not.toBeAny();
    expectTypeOf(r.limit(1).all()).not.toBeAny();
    expectTypeOf(r.first()).not.toBeAny();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
    // @ts-expect-error delete is locked
    r.delete();
    // @ts-expect-error cursor is locked
    r.cursor({ id: 1 });
    expectTypeOf(r.ternary('y')).toEqualTypeOf<ConditionalPosts>();
  });

  test('the early return, let and pipe forms reduce to the class', () => {
    expectTypeOf(instance.earlyReturn('x')).toEqualTypeOf<ConditionalPosts>();
    expectTypeOf(instance.viaPipe('x')).toEqualTypeOf<ConditionalPosts>();
    expectTypeOf(instance.letForm('x')).toEqualTypeOf<ConditionalPosts>();
  });

  test('an annotated let gives the base type', () => {
    const r = instance.letAnnotated('x');
    expectTypeOf(r).toEqualTypeOf<Collection<SoftDeleteContract, 'Post'>>();
    expectTypeOf(r.include('author').all()).not.toBeAny();
    // @ts-expect-error update is locked
    r.update({ title: 'x' });
  });
});

describe('g: unfiltered is not assignable to filtered', () => {
  test('assignment and argument', () => {
    // @ts-expect-error TS2322: the root collection has no filter
    const f: Filtered = Post;
    expectTypeOf(f).not.toBeAny();
    // @ts-expect-error TS2322: the root collection has no order
    const o: Ordered = Post;
    expectTypeOf(o).not.toBeAny();
    // @ts-expect-error TS2322: ordered is not filtered
    const fo: Filtered = Post.orderBy((p) => p.id.asc());
    expectTypeOf(fo).not.toBeAny();
    const takesFiltered = (c: Filtered) => c.update({ title: 'x' });
    // @ts-expect-error TS2345: the root collection has no filter
    takesFiltered(Post);
    expectTypeOf(takesFiltered(Post.where({ id: 1 }))).not.toBeAny();
  });
});
