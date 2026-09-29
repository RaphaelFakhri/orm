import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import {
  type FullTextIndexName,
  type FullTextQuery,
  type FullTextSearchScopesOf,
  fullTextQuery,
  fullTextSearch,
  fulltextScopeObjects,
  fulltextSearchScopes,
  searchFullText,
} from '../src/fulltext-search';
import { type SearchContract, searchSetup } from './fulltext-search-fixture';

class PostCollection extends Collection<SearchContract, 'Post'> {
  searchA(q: FullTextQuery) {
    return fulltextSearchScopes(this).post_title_body_search(q);
  }

  searchB(q: FullTextQuery) {
    return fulltextScopeObjects(this).post_title_body_search.fulltext(q);
  }

  searchC(q: FullTextQuery) {
    return searchFullText(this, 'post_title_body_search', q);
  }

  searchD(q: FullTextQuery) {
    return fullTextSearch('post_title_body_search', q)(this);
  }

  popular() {
    return this.where((post) => post.views.gte(100));
  }

  wrongNames(q: FullTextQuery) {
    // @ts-expect-error not a full-text index
    fulltextSearchScopes(this).posts_user_id_idx(q);
    // @ts-expect-error not a full-text index
    fulltextScopeObjects(this).posts_user_id_idx.fulltext(q);
    // @ts-expect-error not a full-text index
    searchFullText(this, 'posts_user_id_idx', q);
    // @ts-expect-error not a full-text index
    fullTextSearch('posts_user_id_idx', q)(this);
    // @ts-expect-error body is not a field of this index
    fulltextSearchScopes(this).post_title_search(q, { only: 'body' });
    // @ts-expect-error body is not a field of this index
    searchFullText(this, 'post_title_search', q, { only: 'body' });
    // @ts-expect-error body is not a field of this index
    fullTextSearch('post_title_search', q, { only: 'body' })(this);
    return this;
  }
}

const { db, runtime, context } = searchSetup();
const custom = searchSetup().db;
const q = fullTextQuery('hello');
const Post = db.public.Post;
const chained = db.public.Post.where({ userId: 1 }).select('id', 'title');
type Post = typeof Post;
type Chained = typeof chained;
type ChainedRows = Awaited<ReturnType<Chained['all']>>;

describe('shared name resolution', () => {
  test('names are the full-text indexes of the model only', () => {
    expectTypeOf<FullTextIndexName<Post>>().toEqualTypeOf<
      'post_title_body_search' | 'post_title_search'
    >();
    expectTypeOf<FullTextIndexName<typeof db.public.User>>().toBeNever();
  });

  test('the client is constructed as today', () => {
    expectTypeOf(context.contract).toEqualTypeOf<SearchContract>();
    expectTypeOf(runtime).not.toBeAny();
    expectTypeOf(custom.public.Post).not.toBeAny();
  });
});

describe('A: object of functions', () => {
  test('root, chained, include and custom class keep their type', () => {
    const root = fulltextSearchScopes(Post).post_title_body_search(q);
    expectTypeOf(root).toEqualTypeOf<Post>();
    expectTypeOf(root).not.toBeAny();
    const rows = fulltextSearchScopes(chained).post_title_search(q).limit(3).all();
    expectTypeOf(rows).toEqualTypeOf<ReturnType<Chained['all']>>();
    expectTypeOf<ChainedRows>().not.toBeAny();
    db.public.User.include('posts', (posts) => {
      const searched = fulltextSearchScopes(posts).post_title_body_search(q);
      expectTypeOf(searched).toEqualTypeOf<typeof posts>();
      return searched.limit(3);
    });
    const orm = searchSetup();
    const withClass = orm.db;
    expectTypeOf(withClass).not.toBeAny();
    const instance = null as unknown as PostCollection;
    expectTypeOf(instance.searchA(q)).toEqualTypeOf<PostCollection>();
    expectTypeOf(instance.searchA(q).popular()).not.toBeAny();
  });

  test('only full-text indexes are members; a wrong name is an error', () => {
    expectTypeOf<keyof FullTextSearchScopesOf<Post>>().toEqualTypeOf<
      'post_title_body_search' | 'post_title_search'
    >();
    expectTypeOf<keyof FullTextSearchScopesOf<typeof db.public.User>>().toBeNever();
    // @ts-expect-error not a full-text index
    fulltextSearchScopes(Post).posts_user_id_idx(q);
    // @ts-expect-error the model has no full-text index
    fulltextSearchScopes(db.public.User).post_title_search(q);
  });

  test('options are typed from the index literal', () => {
    type Options = Parameters<FullTextSearchScopesOf<Post>['post_title_body_search']>[1];
    expectTypeOf<NonNullable<Options>>().toEqualTypeOf<{
      readonly only?: 'title' | 'subtitle' | 'body';
    }>();
    fulltextSearchScopes(Post).post_title_body_search(q, { only: 'body' });
    // @ts-expect-error body is not a field of this index
    fulltextSearchScopes(Post).post_title_search(q, { only: 'body' });
  });
});

describe('B: object of objects with operations', () => {
  test('root, chained, include and custom class keep their type', () => {
    expectTypeOf(
      fulltextScopeObjects(Post).post_title_body_search.fulltext(q),
    ).toEqualTypeOf<Post>();
    expectTypeOf(
      fulltextScopeObjects(chained).post_title_search.fulltext(q),
    ).toEqualTypeOf<Chained>();
    db.public.User.include('posts', (posts) => {
      const searched = fulltextScopeObjects(posts).post_title_body_search.fulltext(q);
      expectTypeOf(searched).toEqualTypeOf<typeof posts>();
      return searched.limit(3);
    });
    const instance = null as unknown as PostCollection;
    expectTypeOf(instance.searchB(q)).toEqualTypeOf<PostCollection>();
  });

  test('members read the index literal', () => {
    expectTypeOf(
      fulltextScopeObjects(Post).post_title_body_search.language,
    ).toEqualTypeOf<'english'>();
    expectTypeOf(fulltextScopeObjects(Post).post_title_search.language).toEqualTypeOf<'simple'>();
    // @ts-expect-error not a full-text index
    fulltextScopeObjects(Post).posts_views_brin;
    // @ts-expect-error subtitle is not a field of this index
    fulltextScopeObjects(Post).post_title_search.fulltext(q, { only: 'subtitle' });
  });
});

describe('C: one function with the index name', () => {
  test('root, chained, include and custom class keep their type', () => {
    expectTypeOf(searchFullText(Post, 'post_title_body_search', q)).toEqualTypeOf<Post>();
    expectTypeOf(searchFullText(chained, 'post_title_search', q)).toEqualTypeOf<Chained>();
    db.public.User.include('posts', (posts) => {
      const searched = searchFullText(posts, 'post_title_body_search', q, { only: 'subtitle' });
      expectTypeOf(searched).toEqualTypeOf<typeof posts>();
      return searched.limit(3);
    });
    const instance = null as unknown as PostCollection;
    expectTypeOf(instance.searchC(q)).toEqualTypeOf<PostCollection>();
  });

  test('the name and options are checked', () => {
    // @ts-expect-error not a full-text index
    searchFullText(Post, 'posts_user_id_idx', q);
    // @ts-expect-error the model has no full-text index
    searchFullText(db.public.User, 'post_title_search', q);
    // @ts-expect-error body is not a field of this index
    searchFullText(Post, 'post_title_search', q, { only: 'body' });
  });
});

describe('D: curried, collection last', () => {
  test('root, chained, include and custom class keep their type', () => {
    expectTypeOf(fullTextSearch('post_title_body_search', q)(Post)).toEqualTypeOf<Post>();
    expectTypeOf(fullTextSearch('post_title_search', q)(chained)).toEqualTypeOf<Chained>();
    db.public.User.include('posts', (posts) => {
      const searched = fullTextSearch('post_title_body_search', q, { only: 'body' })(posts);
      expectTypeOf(searched).toEqualTypeOf<typeof posts>();
      return searched.limit(3);
    });
    const instance = null as unknown as PostCollection;
    expectTypeOf(instance.searchD(q)).toEqualTypeOf<PostCollection>();
  });

  test('the name and options are checked where the collection is applied', () => {
    // @ts-expect-error not a full-text index
    fullTextSearch('posts_user_id_idx', q)(Post);
    // @ts-expect-error the model has no full-text index
    fullTextSearch('post_title_search', q)(db.public.User);
    // @ts-expect-error body is not a field of this index
    fullTextSearch('post_title_search', q, { only: 'body' })(Post);
  });
});
