import { describe, expect, it } from 'vitest';
import { fragment, rowFragment, sortField, when } from '../src/pipe-fragments';
import { isSelectAst } from './helpers';
import {
  type SoftDeleteContract,
  SoftPostCollection,
  softDeleteSetup,
} from './pipe-fragments-fixture';

function lastSelect(runtime: ReturnType<typeof softDeleteSetup>['runtime']) {
  const ast = runtime.executions.at(-1)?.plan.ast;
  if (!isSelectAst(ast)) throw new Error('expected a select');
  return ast;
}

const notDeleted = fragment<SoftDeleteContract>()(
  { deletedAt: { codecId: 'pg/timestamptz-date@1', nullable: true } },
  (c) => c.where((p) => p.deletedAt.isNull()).orderBy((p) => p.deletedAt.desc()),
);

describe('when', () => {
  it('applies the step only for a truthy value', async () => {
    const { runtime, db } = softDeleteSetup();
    const search = (term: string | undefined) =>
      db.public.Post.pipe(when(term, (c, t) => c.where((p) => p.title.eq(t)))).all();
    await search('hello');
    expect(lastSelect(runtime).where).toBeDefined();
    await search(undefined);
    expect(lastSelect(runtime).where).toBeUndefined();
  });

  it('keeps the custom collection class', () => {
    const { custom } = softDeleteSetup();
    const searched = custom.public.Post.pipe(when('x', (c, t) => c.where((p) => p.title.eq(t))));
    expect(searched).toBeInstanceOf(SoftPostCollection);
  });
});

describe('fragment', () => {
  it('adds its filter and order to any model with the field', async () => {
    const { runtime, db } = softDeleteSetup();
    await db.public.Post.where({ userId: 1 }).pipe(notDeleted).limit(5).all();
    const ast = lastSelect(runtime);
    expect(JSON.stringify(ast.where)).toContain('deleted_at');
    expect(ast.orderBy).toMatchObject([{ dir: 'desc', expr: { column: 'deleted_at' } }]);
    await db.public.Comment.pipe(notDeleted).all();
    expect(JSON.stringify(lastSelect(runtime).where)).toContain('deleted_at');
  });

  it('works inside an include refinement', async () => {
    const { runtime, db } = softDeleteSetup();
    await db.public.User.include('posts', (posts) => posts.pipe(notDeleted).limit(3)).all();
    expect(JSON.stringify(runtime.executions.at(-1)?.plan.ast)).toContain('deleted_at');
  });

  it('rejects a model without the field at run time', () => {
    const { db } = softDeleteSetup();
    const untyped: (collection: typeof db.public.Tag) => unknown = notDeleted as never;
    expect(() => untyped(db.public.Tag)).toThrow(/needs field "deletedAt"/);
  });
});

describe('rowFragment', () => {
  it('selects and includes on a filtered collection', async () => {
    const { runtime, db } = softDeleteSetup();
    const summary = rowFragment<SoftDeleteContract, 'Post'>()((c) =>
      c.select('id', 'title').include('author'),
    );
    await db.public.Post.where({ userId: 1 }).pipe(summary).all();
    expect(JSON.stringify(runtime.executions.at(-1)?.plan.ast)).toContain('user_id');
  });
});

describe('sortField', () => {
  it('orders by a checked field name', async () => {
    const { runtime, db } = softDeleteSetup();
    await db.public.Post.orderBy(sortField(db.public.Post, 'title', 'desc')).all();
    expect(lastSelect(runtime).orderBy).toMatchObject([{ dir: 'desc', expr: { column: 'title' } }]);
  });

  it('rejects unknown, unsortable and disallowed names', () => {
    const { db } = softDeleteSetup();
    expect(() => sortField(db.public.Post, 'nope')).toThrow('Cannot sort Post by "nope"');
    expect(() => sortField(db.public.Post, 'embedding')).toThrow('Cannot sort Post by "embedding"');
    expect(() => sortField(db.public.Post, 'views', 'asc', ['title'])).toThrow(
      'Cannot sort Post by "views"',
    );
    expect(() => sortField(db.public.Post, 'author')).toThrow('Cannot sort Post by "author"');
  });
});
