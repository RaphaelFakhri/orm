import { describe, expect, it } from 'vitest';
import { type SortDirection, sortField } from '../src/query-fragments';
import { createChainingOrm } from './collection-chaining-fixture';

describe('sortField', () => {
  it('orders like the same field written in orderBy', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.orderBy((p) => p.title.desc()).all();
    await db.Post.orderBy(sortField(db.Post, 'title', 'desc')).all();
    await db.Post.orderBy((p) => p.title.asc()).all();
    const [direct, sorted, ascending] = runtime.executions;
    expect(sorted?.plan.ast).toBeDefined();
    expect(sorted?.plan.ast).toEqual(direct?.plan.ast);
    expect(sorted?.plan.ast).not.toEqual(ascending?.plan.ast);
  });

  it('sorts ascending by default and through the field to column mapping', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.orderBy((p) => p.userId.asc()).all();
    await db.Post.orderBy(sortField(db.Post, 'userId')).all();
    const [direct, sorted] = runtime.executions;
    expect(sorted?.plan.ast).toEqual(direct?.plan.ast);
  });

  it('accepts a name in the allowed list', async () => {
    const { db, runtime } = createChainingOrm();
    await db.Post.orderBy((p) => p.views.desc()).all();
    await db.Post.orderBy(sortField(db.Post, 'views', 'desc', ['title', 'views'])).all();
    const [direct, sorted] = runtime.executions;
    expect(sorted?.plan.ast).toEqual(direct?.plan.ast);
  });

  it('works inside an include refinement', async () => {
    const { db, runtime } = createChainingOrm();
    await db.User.include('posts', (posts) => posts.orderBy((p) => p.title.asc())).all();
    await db.User.include('posts', (posts) => posts.orderBy(sortField(posts, 'title'))).all();
    const [direct, sorted] = runtime.executions;
    expect(sorted?.plan.ast).toEqual(direct?.plan.ast);
  });

  describe('throws ORM.ARGUMENT_INVALID before the query runs', () => {
    it('for a name that is not a field', () => {
      const { db, runtime } = createChainingOrm();
      expect(() => sortField(db.Post, 'nope')).toThrow(
        expect.objectContaining({
          code: 'ORM.ARGUMENT_INVALID',
          message: 'Cannot sort Post by "nope"',
          why: 'Post has no field "nope".',
          fix: 'Sort by one of: id, title, userId, views.',
          meta: { model: 'Post', field: 'nope' },
        }),
      );
      expect(runtime.executions).toEqual([]);
    });

    it('for a relation', () => {
      const { db } = createChainingOrm();
      expect(() => sortField(db.Post, 'author')).toThrow(
        expect.objectContaining({
          code: 'ORM.ARGUMENT_INVALID',
          why: '"author" is a relation of Post, not a field.',
        }),
      );
    });

    it('for a field whose codec has no order trait', () => {
      const { db } = createChainingOrm();
      expect(() => sortField(db.Post, 'embedding')).toThrow(
        expect.objectContaining({
          code: 'ORM.ARGUMENT_INVALID',
          why: 'The codec pg/vector@1 of Post.embedding cannot be ordered.',
        }),
      );
    });

    it('for a field outside the allowed list', () => {
      const { db } = createChainingOrm();
      expect(() => sortField(db.Post, 'views', 'asc', ['title', 'id'])).toThrow(
        expect.objectContaining({
          code: 'ORM.ARGUMENT_INVALID',
          message: 'Cannot sort Post by "views"',
          why: '"views" is not one of the fields allowed for sorting.',
          fix: 'Sort by one of: title, id.',
        }),
      );
    });

    it('for a direction other than asc and desc', () => {
      const { db } = createChainingOrm();
      const direction = 'up' as SortDirection;
      expect(() => sortField(db.Post, 'title', direction)).toThrow(
        expect.objectContaining({
          code: 'ORM.ARGUMENT_INVALID',
          message: 'Cannot sort Post in direction "up"',
          why: 'A sort direction is "asc" or "desc".',
          fix: 'Pass "asc" or "desc".',
          meta: { model: 'Post', direction: 'up' },
        }),
      );
    });
  });
});
