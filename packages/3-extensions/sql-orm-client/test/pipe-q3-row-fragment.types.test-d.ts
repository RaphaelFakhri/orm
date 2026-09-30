import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { type RowOf, rowFragment } from '../src/pipe-fragments';
import type { CollectionTypeState } from '../src/types';
import { type SoftDeleteContract, softDeleteSetup } from './pipe-fragments-fixture';

const { db } = softDeleteSetup();
const Post = db.public.Post;

const summaryRoot = (c: typeof Post) => c.select('id', 'title').include('author');
const summaryPick = (c: Pick<typeof Post, 'select'>) => c.select('id', 'title').include('author');
const summaryDefault = (c: Collection<SoftDeleteContract, 'Post'>) =>
  c.select('id', 'title').include('author');
const summaryGeneric = <
  C extends Collection<SoftDeleteContract, 'Post', unknown, CollectionTypeState>,
>(
  c: C,
) =>
  // @ts-expect-error TS2345: with the state as a type parameter, relation names resolve to never
  c.select('id', 'title').include('author');
const summary = rowFragment<SoftDeleteContract, 'Post'>()((c) =>
  c.select('id', 'title').include('author'),
);

class SummaryPosts extends Collection<SoftDeleteContract, 'Post'> {
  summaryRoot() {
    return this.pipe(summaryRoot);
  }
  summary() {
    return this.pipe(summary);
  }
  summaryPick() {
    return this.pipe(summaryPick);
  }
}

describe('rowFragment', () => {
  test('root, chained, after select, include refinement and this', () => {
    const root = Post.pipe(summary);
    expectTypeOf(root).not.toBeAny();
    const direct = Post.select('id', 'title').include('author');
    expectTypeOf(root.first()).toEqualTypeOf(direct.first());
    expectTypeOf(Post.where({ userId: 1 }).pipe(summary)).toEqualTypeOf(root);
    expectTypeOf(Post.select('views').pipe(summary)).toEqualTypeOf(root);
    const users = db.public.User.include('posts', (posts) => posts.pipe(summary).limit(2)).first();
    expectTypeOf(users).not.toBeAny();
    const instance = null as unknown as SummaryPosts;
    expectTypeOf(instance.summary()).toEqualTypeOf(root);
  });

  test('the row type can be named from the fragment', () => {
    type PostSummary = RowOf<ReturnType<typeof summary>>;
    expectTypeOf<PostSummary>().toEqualTypeOf<{
      id: number;
      title: string;
      author: {
        name: string;
        id: number;
        invitedById: number | null;
        address: {
          readonly city: string;
          readonly street: string;
          readonly zip: string | null;
        } | null;
        email: string;
      };
    }>();
  });

  test('the caller state is not kept', () => {
    // @ts-expect-error the where before the step is not recorded in the result
    Post.where({ userId: 1 }).pipe(summary).update({ title: 'x' });
  });

  test('rejected for another model', () => {
    // @ts-expect-error summary is for Post
    db.public.Comment.pipe(summary);
  });
});

describe('plain functions written by the user', () => {
  test('typed with the root collection type: not in an include refinement or after select', () => {
    expectTypeOf(Post.pipe(summaryRoot)).not.toBeAny();
    expectTypeOf(Post.where({ userId: 1 }).pipe(summaryRoot)).not.toBeAny();
    const instance = null as unknown as SummaryPosts;
    expectTypeOf(instance.summaryRoot()).not.toBeAny();
    // @ts-expect-error the row after select is narrower
    Post.select('views').pipe(summaryRoot);
    // @ts-expect-error an include refinement collection is not a Collection
    db.public.User.include('posts', (posts) => posts.pipe(summaryRoot));
  });

  test('typed with Pick<typeof root, "select">: works everywhere', () => {
    const root = Post.pipe(summaryPick);
    expectTypeOf(root.first()).toEqualTypeOf(Post.select('id', 'title').include('author').first());
    expectTypeOf(Post.where({ userId: 1 }).pipe(summaryPick)).toEqualTypeOf(root);
    expectTypeOf(Post.select('views').pipe(summaryPick)).toEqualTypeOf(root);
    const users = db.public.User.include('posts', (posts) => posts.pipe(summaryPick)).first();
    expectTypeOf(users).not.toBeAny();
    const instance = null as unknown as SummaryPosts;
    expectTypeOf(instance.summaryPick()).toEqualTypeOf(root);
    // @ts-expect-error Comment has another select signature
    db.public.Comment.pipe(summaryPick);
  });

  test('typed with Collection<Contract, Model>: not on the client root', () => {
    // @ts-expect-error the client root carries namespace "public", the default type carries never
    Post.pipe(summaryDefault);
  });

  test('generic over the collection', () => {
    expectTypeOf(Post.pipe(summaryGeneric)).not.toBeAny();
  });
});
