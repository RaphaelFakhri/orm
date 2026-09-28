import { describe, expect, it } from 'vitest';
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import contractJson from './fixtures/generated/contract.json' with { type: 'json' };
import {
  buildTestContextFromContract,
  createMockRuntime,
  deserializeTestContract,
  isSelectAst,
} from './helpers';
import { brinScopes, fakeTsQuery, fullTextScopes, type ScopedContract } from './scopes-fixture';

function scopedContract(): ScopedContract {
  const json = JSON.parse(JSON.stringify(contractJson));
  const posts = json.storage.namespaces.public.entries.table.posts;
  const fullText = (name: string) => ({
    name,
    expression: 'to_tsvector(\'english\', "title")',
    unique: false,
    type: 'gin',
    options: { language: 'english', weights: [['title']] },
  });
  posts.indexes = [...posts.indexes, fullText('search'), fullText('where'), fullText('published')];
  const scope = (index: string) => ({ type: 'test/fulltext', params: { index } });
  json.domain.namespaces.public.models.Post.scopes = {
    search: scope('search'),
    where: scope('where'),
    published: scope('published'),
  };
  return deserializeTestContract(json) as unknown as ScopedContract;
}

class PostCollection extends Collection<ScopedContract, 'Post'> {
  published() {
    return this.where((post) => post.views.gte(100));
  }
}

function setup() {
  const runtime = createMockRuntime();
  const context = {
    ...buildTestContextFromContract(scopedContract()),
    collectionScopes: [fullTextScopes, brinScopes],
  };
  const db = orm({ runtime, context, collections: { Post: PostCollection } });
  const plain = orm({ runtime, context });
  return { runtime, db, plain };
}

function lastSelect(runtime: ReturnType<typeof createMockRuntime>) {
  const ast = runtime.executions.at(-1)?.plan.ast;
  if (!isSelectAst(ast)) throw new Error('expected a select');
  return ast;
}

const q = fakeTsQuery('hello');

describe('collection scopes', () => {
  it('fails at construction when the contract needs a contribution that was not passed', () => {
    const runtime = createMockRuntime();
    const context = {
      ...buildTestContextFromContract(scopedContract()),
      collectionScopes: [brinScopes],
    };
    expect(() => orm({ runtime, context })).toThrow(
      /Scope 'search' on model 'public.Post' needs the collection scope contribution 'test\/fulltext'/,
    );
  });

  it('adds a filter and a default order', async () => {
    const { runtime, db } = setup();
    await db.public.Post.scopes.search.fulltext(q).limit(10).all();
    const ast = lastSelect(runtime);
    expect(JSON.stringify(ast.where)).toContain('%hello%');
    expect(ast.orderBy).toMatchObject([{ dir: 'desc', expr: { table: 'posts', column: 'title' } }]);
  });

  it('an explicit orderBy replaces the default order, before or after the scope call', async () => {
    const { runtime, db, plain } = setup();
    await db.public.Post.scopes.search
      .fulltext(q)
      .orderBy((p) => p.id.asc())
      .all();
    expect(lastSelect(runtime).orderBy).toMatchObject([{ dir: 'asc', expr: { column: 'id' } }]);

    await plain.public.Post.orderBy((p) => p.id.asc())
      .scopes.search.fulltext(q)
      .all();
    expect(lastSelect(runtime).orderBy).toMatchObject([{ dir: 'asc', expr: { column: 'id' } }]);
  });

  it('keeps the custom collection class and its members', () => {
    const { db } = setup();
    const searched = db.public.Post.scopes.search.fulltext(q);
    expect(searched).toBeInstanceOf(PostCollection);
    expect('published' in searched).toBe(true);
    expect(typeof db.public.Post.where).toBe('function');
    expect(typeof db.public.Post.scopes.where.fulltext).toBe('function');
    expect(typeof db.public.Post.scopes.published.fulltext).toBe('function');
  });

  it('is present inside an include refinement and absent on a model without the index', async () => {
    const { runtime, db } = setup();
    await db.public.User.include('posts', (posts) =>
      posts.scopes.search.fulltext(q).limit(3),
    ).all();
    expect(JSON.stringify(runtime.executions.at(-1)?.plan.ast)).toContain('%hello%');
    expect(db.public.User.scopes).toEqual({});
  });
});
