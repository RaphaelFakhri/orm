import { describe, expect, it } from 'vitest';
import { rowFragment } from '../src/query-fragments';
import { createChainingOrm } from './collection-chaining-fixture';
import type { TestContract } from './helpers';

const summary = rowFragment<TestContract, 'Post'>()((posts) =>
  posts.select('id', 'title').include('author'),
);

describe('rowFragment', () => {
  it('runs the body on the collection it is applied to', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.select('id', 'title').include('author').all();
    await db.Post.pipe(summary).all();
    await db.Post.all();
    const [inline, piped, unchanged] = runtime.executions;
    expect(piped?.plan.ast).toBeDefined();
    expect(piped?.plan.ast).toEqual(inline?.plan.ast);
    expect(piped?.plan.ast).not.toEqual(unchanged?.plan.ast);
  });

  it('keeps a filter applied before the step', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.where((p) => p.views.gte(100))
      .select('id', 'title')
      .include('author')
      .all();
    await db.Post.published().pipe(summary).all();
    const [inline, piped] = runtime.executions;
    expect(piped?.plan.ast).toEqual(inline?.plan.ast);
  });

  it('runs inside an include refinement', async () => {
    const { db, runtime } = createChainingOrm();
    await db.User.include('posts', (posts) => posts.select('id', 'title').include('author')).all();
    await db.User.include('posts', (posts) => posts.pipe(summary)).all();
    const [inline, piped] = runtime.executions;
    expect(piped?.plan.ast).toBeDefined();
    expect(piped?.plan.ast).toEqual(inline?.plan.ast);
  });
});
