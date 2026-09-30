import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { sortField } from '../src/pipe-fragments';
import { type SoftDeleteContract, softDeleteSetup } from './pipe-fragments-fixture';

const { db } = softDeleteSetup();
const Post = db.public.Post;

declare const input: { sort: string; direction: 'asc' | 'desc' };

class SortedPosts extends Collection<SoftDeleteContract, 'Post'> {
  sorted(name: string) {
    return this.orderBy(sortField(this, name, 'desc', ['title', 'views']));
  }
}

describe('sortField', () => {
  test('root, chained, include refinement and this', () => {
    expectTypeOf(Post.orderBy(sortField(Post, input.sort, input.direction))).toEqualTypeOf<
      ReturnType<(typeof Post)['orderBy']>
    >();
    const chained = Post.where({ userId: 1 });
    expectTypeOf(chained.orderBy(sortField(chained, input.sort)).cursor({ id: 1 })).not.toBeAny();
    const users = db.public.User.include('posts', (posts) =>
      posts.orderBy(sortField(posts, input.sort, 'asc', ['title'])),
    ).all();
    expectTypeOf(users).not.toBeAny();
    const instance = null as unknown as SortedPosts;
    expectTypeOf(instance.sorted('title').cursor({ id: 1 })).not.toBeAny();
  });

  test('the allowed list only takes sortable fields of the model', () => {
    sortField(Post, input.sort, 'asc', ['title', 'views', 'deletedAt']);
    // @ts-expect-error not a field of Post
    sortField(Post, input.sort, 'asc', ['nope']);
    // @ts-expect-error embedding has no order trait
    sortField(Post, input.sort, 'asc', ['embedding']);
    // @ts-expect-error a relation is not a sort field
    sortField(Post, input.sort, 'asc', ['author']);
  });

  test('the selector only fits a model with the allowed fields', () => {
    // @ts-expect-error Tag has no title field
    db.public.Tag.orderBy(sortField(Post, input.sort, 'asc', ['title']));
    // @ts-expect-error Tag has none of the sortable fields of Post
    db.public.Tag.orderBy(sortField(Post, input.sort));
  });
});
