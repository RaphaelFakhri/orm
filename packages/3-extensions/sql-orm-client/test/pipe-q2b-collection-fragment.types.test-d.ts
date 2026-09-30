import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { fragment, stateFragment } from '../src/pipe-fragments';
import {
  type SoftDeleteContract,
  type SoftPostCollection,
  softDeleteSetup,
} from './pipe-fragments-fixture';

const deletedAt = { deletedAt: { codecId: 'pg/timestamptz-date@1', nullable: true } } as const;

const notDeleted = fragment<SoftDeleteContract>()(deletedAt, (c) =>
  c.where((p) => p.deletedAt.isNull()).orderBy((p) => p.deletedAt.desc()),
);

const notDeletedState = stateFragment<SoftDeleteContract>()(deletedAt, (c) =>
  c.where((p) => p.deletedAt.isNull()).orderBy((p) => p.deletedAt.desc()),
);

const { db, custom } = softDeleteSetup();
const Post = db.public.Post;

class FragmentPosts extends Collection<SoftDeleteContract, 'Post'> {
  live() {
    return this.pipe(notDeleted);
  }
  liveState() {
    return this.pipe(notDeletedState);
  }
}

describe('fragment: result keeps the caller type', () => {
  test('root and chained collections', () => {
    expectTypeOf(Post.pipe(notDeleted)).toEqualTypeOf<typeof Post>();
    expectTypeOf(Post.pipe(notDeleted)).not.toBeAny();
    expectTypeOf(db.public.Comment.pipe(notDeleted)).toEqualTypeOf<typeof db.public.Comment>();
    const chained = Post.where({ userId: 1 }).select('id', 'title');
    expectTypeOf(chained.pipe(notDeleted)).toEqualTypeOf<typeof chained>();
    expectTypeOf(chained.pipe(notDeleted).update({ title: 'x' })).not.toBeAny();
  });

  test('custom class root and this', () => {
    expectTypeOf(custom.public.Post.pipe(notDeleted)).toEqualTypeOf<SoftPostCollection>();
    expectTypeOf(custom.public.Post.pipe(notDeleted).popular()).not.toBeAny();
    const instance = null as unknown as FragmentPosts;
    expectTypeOf(instance.live()).toEqualTypeOf<FragmentPosts>();
  });

  test('include refinement', () => {
    const users = db.public.User.include('posts', (posts) => posts.pipe(notDeleted).limit(3)).all();
    expectTypeOf(users).not.toBeAny();
  });

  test('the type state is not updated', () => {
    // @ts-expect-error the where inside the fragment is not recorded
    Post.pipe(notDeleted).update({ title: 'x' });
    // @ts-expect-error the orderBy inside the fragment is not recorded
    Post.pipe(notDeleted).cursor({ id: 1 });
  });

  test('rejected for a model without the field', () => {
    // @ts-expect-error Tag has no deletedAt
    db.public.Tag.pipe(notDeleted);
    // @ts-expect-error User has no deletedAt
    db.public.User.pipe(notDeleted);
  });

  test('the body cannot change the row or use undeclared fields', () => {
    const soft = fragment<SoftDeleteContract>();
    // @ts-expect-error select is not offered
    soft(deletedAt, (c) => c.select('id'));
    // @ts-expect-error include is not offered
    soft(deletedAt, (c) => c.include('author'));
    // @ts-expect-error title is not declared
    soft(deletedAt, (c) => c.where((p) => p.title.eq('x')));
    expectTypeOf(soft(deletedAt, (c) => c.limit(1).offset(2))).not.toBeAny();
  });
});

describe('stateFragment: the result records the where and orderBy', () => {
  test('root collection unlocks update and cursor', () => {
    const live = Post.pipe(notDeletedState);
    expectTypeOf(live.update({ title: 'x' })).not.toBeAny();
    expectTypeOf(live.cursor({ id: 1 })).not.toBeAny();
    expectTypeOf(live.all()).toEqualTypeOf<ReturnType<(typeof Post)['all']>>();
  });

  test('custom class root loses its methods, like where does', () => {
    const live = custom.public.Post.pipe(notDeletedState);
    // @ts-expect-error popular is a method of the custom class
    live.popular();
    expectTypeOf(live.update({ title: 'x' })).not.toBeAny();
  });

  test('this inside a custom class', () => {
    const instance = null as unknown as FragmentPosts;
    expectTypeOf(instance.liveState().cursor({ id: 1 })).not.toBeAny();
  });

  test('rejected for a model without the field', () => {
    // @ts-expect-error Tag has no deletedAt
    db.public.Tag.pipe(notDeletedState);
  });
});
