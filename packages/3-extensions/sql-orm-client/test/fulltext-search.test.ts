import { describe, expect, it } from 'vitest';
import { Collection } from '../src/collection';
import {
  type FullTextQuery,
  fullTextQuery,
  fullTextSearch,
  fulltextScopeObjects,
  fulltextSearchScopes,
  searchFullText,
} from '../src/fulltext-search';
import { orm } from '../src/orm';
import { type SearchContract, searchSetup } from './fulltext-search-fixture';
import { isSelectAst } from './helpers';

class PostCollection extends Collection<SearchContract, 'Post'> {
  search(q: FullTextQuery) {
    return fulltextSearchScopes(this).post_title_body_search(q);
  }

  popular() {
    return this.where((post) => post.views.gte(100));
  }
}

const q = fullTextQuery('hello');

function lastSelect(runtime: ReturnType<typeof searchSetup>['runtime']) {
  const ast = runtime.executions.at(-1)?.plan.ast;
  if (!isSelectAst(ast)) throw new Error('expected a select');
  return ast;
}

describe('full-text search helpers', () => {
  it('each option adds a filter and an order and returns a chainable collection', async () => {
    const { runtime, db } = searchSetup();
    const Post = db.public.Post;
    const searches = [
      fulltextSearchScopes(Post.where({ userId: 1 })).post_title_body_search(q),
      fulltextScopeObjects(Post).post_title_body_search.fulltext(q),
      searchFullText(Post, 'post_title_body_search', q),
      fullTextSearch('post_title_body_search', q)(Post),
    ];
    for (const searched of searches) {
      await searched.limit(10).all();
      const ast = lastSelect(runtime);
      expect(JSON.stringify(ast.where)).toContain('%hello%');
      expect(ast.orderBy).toMatchObject([{ dir: 'desc', expr: { column: 'title' } }]);
      expect(ast.limit).toBeDefined();
    }
  });

  it('only picks the column', async () => {
    const { db } = searchSetup();
    await expect(async () =>
      searchFullText(db.public.Post, 'post_title_body_search', q, { only: 'body' }).all(),
    ).rejects.toThrow(/Unknown column "body"/);
  });

  it('keeps the custom collection class', () => {
    const { runtime, context } = searchSetup();
    const db = orm({ runtime, context, collections: { Post: PostCollection } });
    const searched = db.public.Post.search(q);
    expect(searched).toBeInstanceOf(PostCollection);
    expect(searched.popular()).toBeInstanceOf(PostCollection);
  });

  it('works inside an include refinement', async () => {
    const { runtime, db } = searchSetup();
    await db.public.User.include('posts', (posts) =>
      fulltextSearchScopes(posts).post_title_search(q).limit(3),
    ).all();
    expect(JSON.stringify(runtime.executions.at(-1)?.plan.ast)).toContain('%hello%');
  });

  it('a model with no full-text index offers nothing', () => {
    const { db } = searchSetup();
    expect(Object.keys(fulltextSearchScopes(db.public.User))).toEqual([]);
  });
});
