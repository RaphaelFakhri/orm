import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { type FullTextQuery, fullTextQuery, fullTextSearch } from '../src/fulltext-search';
import { type SearchContract, searchSetup } from './fulltext-search-fixture';

class PostCollection extends Collection<SearchContract, 'Post'> {
  search(q: FullTextQuery) {
    return this.pipe(fullTextSearch('post_title_body_search', q));
  }

  popular() {
    return this.where((post) => post.views.gte(100));
  }

  wrongNames(q: FullTextQuery) {
    // @ts-expect-error not a full-text index
    this.pipe(fullTextSearch('posts_user_id_idx', q));
    // @ts-expect-error body is not a field of this index
    this.pipe(fullTextSearch('post_title_search', q, { only: 'body' }));
    return this;
  }
}

const { db } = searchSetup();
const q = fullTextQuery('hello');
const Post = db.public.Post;
const chained = db.public.Post.where({ userId: 1 }).select('id', 'title');

describe('E: curried helper applied with pipe', () => {
  test('root, chained, include and custom class keep their type', () => {
    const root = Post.pipe(fullTextSearch('post_title_body_search', q));
    expectTypeOf(root).toEqualTypeOf<typeof Post>();
    expectTypeOf(root).not.toBeAny();
    const rows = chained.pipe(fullTextSearch('post_title_search', q)).limit(10).all();
    expectTypeOf(rows).toEqualTypeOf<ReturnType<(typeof chained)['all']>>();
    db.public.User.include('posts', (posts) => {
      const searched = posts.pipe(fullTextSearch('post_title_body_search', q, { only: 'body' }));
      expectTypeOf(searched.limit(3)).not.toBeAny();
      return searched.limit(3);
    });
    const instance = null as unknown as PostCollection;
    expectTypeOf(instance.search(q)).toEqualTypeOf<PostCollection>();
    expectTypeOf(instance.search(q).popular()).not.toBeAny();
  });

  test('the name and options are checked at the pipe call', () => {
    // @ts-expect-error not a full-text index
    Post.pipe(fullTextSearch('posts_user_id_idx', q));
    // @ts-expect-error the model has no full-text index
    db.public.User.pipe(fullTextSearch('post_title_search', q));
    // @ts-expect-error body is not a field of this index
    Post.pipe(fullTextSearch('post_title_search', q, { only: 'body' }));
  });

  test('pipe takes any function of the collection', () => {
    expectTypeOf(Post.pipe((posts) => posts.limit(1))).toEqualTypeOf<typeof Post>();
    expectTypeOf(Post.pipe(() => 42)).toEqualTypeOf<number>();
  });
});
