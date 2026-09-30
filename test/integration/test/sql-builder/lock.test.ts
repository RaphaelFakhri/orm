import type { SqlQueryPlan } from '@internal/sql-relational-core/plan';
import { withTransaction } from '@internal/sql-runtime';
import { describe, expect, it } from 'vitest';
import { setupIntegrationTest, timeouts } from './setup';

describe('integration: row locking', { timeout: timeouts.databaseOperation }, () => {
  const { db, runtime } = setupIntegrationTest();

  const inTransaction = <Row>(plan: SqlQueryPlan<Row>) =>
    withTransaction(runtime(), async (tx) => await tx.query(plan));

  const alice = () =>
    db()
      .public.users.select('id', 'name')
      .where((f, fns) => fns.eq(f.id, 1));

  it.each(['forUpdate', 'forNoKeyUpdate', 'forShare', 'forKeyShare'] as const)(
    '%s returns the locked row',
    async (method) => {
      expect(await inTransaction(alice()[method]().build())).toEqual([{ id: 1, name: 'Alice' }]);
    },
  );

  it('forUpdate with skipLocked returns the row', async () => {
    expect(await inTransaction(alice().forUpdate({ skipLocked: true }).build())).toEqual([
      { id: 1, name: 'Alice' },
    ]);
  });

  it('forUpdate with nowait returns the row', async () => {
    expect(await inTransaction(alice().forUpdate({ nowait: true }).build())).toEqual([
      { id: 1, name: 'Alice' },
    ]);
  });

  it('forUpdate of the only table returns the row', async () => {
    expect(
      await inTransaction(
        alice()
          .forUpdate({ of: ['users'] })
          .build(),
      ),
    ).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('forUpdate of an alias on a joined select returns the joined row', async () => {
    const d = db();
    const plan = d.public.users
      .as('u')
      .innerJoin(d.public.posts, (f, fns) => fns.eq(f.u.id, f.posts.user_id))
      .select('name', 'title')
      .where((f, fns) => fns.eq(f.u.id, 2))
      .forUpdate({ of: ['u'] })
      .build();

    expect(await inTransaction(plan)).toEqual([{ name: 'Bob', title: 'Bobs Post' }]);
  });

  it('the work-queue shape claims one row', async () => {
    const plan = db()
      .public.posts.select('id', 'title')
      .where((f, fns) => fns.gt(f.views, 40))
      .orderBy('views')
      .limit(1)
      .forUpdate({ skipLocked: true })
      .build();

    expect(await inTransaction(plan)).toEqual([{ id: 2, title: 'Second Post' }]);
  });
});
