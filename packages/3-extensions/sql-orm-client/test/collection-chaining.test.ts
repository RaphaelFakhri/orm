import { describe, expect, it } from 'vitest';
import { createChainingOrm, PostCollection } from './collection-chaining-fixture';

describe('pipe', () => {
  it('returns what the step returns', () => {
    const { db } = createChainingOrm();
    const result = { piped: true };
    expect(db.Post.pipe(() => result)).toBe(result);
  });

  it('passes the receiver to the step', () => {
    const { db } = createChainingOrm();
    const posts = db.Post.recent();
    expect(posts.pipe((received) => received)).toBe(posts);
  });

  it('a piped where reaches the query plan', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.all();
    await db.Post.where((p) => p.views.gte(100)).all();
    await db.Post.pipe((posts) => posts.where((p) => p.views.gte(100))).all();
    const [unfiltered, direct, piped] = runtime.executions;
    expect(piped?.plan.ast).toEqual(direct?.plan.ast);
    expect(piped?.plan.ast).not.toEqual(unfiltered?.plan.ast);
  });
});

describe('chained class methods', () => {
  it('run in order and keep the class', async () => {
    const { db, runtime } = createChainingOrm();
    const chained = db.Post.where({ title: 'x' }).published().recent().limit(5);
    expect(chained).toBeInstanceOf(PostCollection);
    await chained.all();
    await db.Post.where({ title: 'x' })
      .where((p) => p.views.gte(100))
      .orderBy((p) => p.views.desc())
      .limit(5)
      .all();
    const [viaClass, viaBuiltIns] = runtime.executions;
    expect(viaClass?.plan.ast).toEqual(viaBuiltIns?.plan.ast);
  });

  it('run after include', async () => {
    const { db, runtime } = createChainingOrm();
    const chained = db.Post.include('author').published();
    expect(chained).toBeInstanceOf(PostCollection);
    await chained.all();
    await db.Post.include('author')
      .where((p) => p.views.gte(100))
      .all();
    const [viaClass, viaBuiltIns] = runtime.executions;
    expect(viaClass?.plan.ast).toEqual(viaBuiltIns?.plan.ast);
  });
});
