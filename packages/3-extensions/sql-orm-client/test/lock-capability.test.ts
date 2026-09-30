import { soleDomainNamespaceId } from '@internal/contract/types';
import { LockingClause } from '@internal/sql-relational-core/ast';
import { describe, expect, it } from 'vitest';
import { Collection } from '../src/collection';
import { baseContract, createCollectionFor } from './collection-fixtures';
import { createMockRuntime, getTestContext, withCapabilities } from './helpers';

const allFlags = baseContract.capabilities;

function postsWith(capabilities: Record<string, Record<string, boolean>>) {
  const contract = withCapabilities(baseContract, capabilities);
  return new Collection(
    { runtime: createMockRuntime(), context: { ...getTestContext(), contract } },
    'Post',
    {
      namespaceId: soleDomainNamespaceId(contract.domain),
    },
  );
}

function withoutFlag(group: 'sql' | 'postgres', flag: string) {
  return postsWith({ ...allFlags, [group]: { ...allFlags[group], [flag]: false } });
}

const capabilityMissing = (method: string, capability: string) =>
  expect.objectContaining({
    name: 'StructuredError',
    code: 'ORM.CAPABILITY_MISSING',
    message: `${method}() requires capability ${capability}`,
    meta: { capability, method },
  });

describe('row-locking methods', () => {
  it.each(['forUpdate', 'forNoKeyUpdate', 'forShare', 'forKeyShare'] as const)(
    '%s appends a clause locking the model table',
    (method) => {
      const { collection } = createCollectionFor('Post');

      expect(collection[method]().state.locking).toEqual([
        LockingClause.of(method, { of: ['posts'] }),
      ]);
    },
  );

  it('nowait and skipLocked set the wait policy', () => {
    const { collection } = createCollectionFor('Post');

    expect(collection.forUpdate({ nowait: true }).state.locking).toEqual([
      LockingClause.of('forUpdate', { of: ['posts'], waitPolicy: 'nowait' }),
    ]);
    expect(collection.forShare({ skipLocked: true }).state.locking).toEqual([
      LockingClause.of('forShare', { of: ['posts'], waitPolicy: 'skipLocked' }),
    ]);
  });

  it('two calls append two clauses in order', () => {
    const { collection } = createCollectionFor('Post');

    expect(collection.forUpdate().forKeyShare({ skipLocked: true }).state.locking).toEqual([
      LockingClause.of('forUpdate', { of: ['posts'] }),
      LockingClause.of('forKeyShare', { of: ['posts'], waitPolicy: 'skipLocked' }),
    ]);
  });

  it('the lock survives later where, orderBy and limit calls', () => {
    const { collection } = createCollectionFor('Post');
    const locked = collection
      .forUpdate()
      .where((post) => post.views.gt(1))
      .orderBy((post) => post.id.asc())
      .limit(1);

    expect(locked.state.locking).toEqual([LockingClause.of('forUpdate', { of: ['posts'] })]);
  });

  it('nowait with skipLocked throws ORM.ARGUMENT_INVALID', () => {
    const { collection } = createCollectionFor('Post');

    // @ts-expect-error nowait and skipLocked exclude each other
    expect(() => collection.forUpdate({ nowait: true, skipLocked: true })).toThrow(
      expect.objectContaining({
        code: 'ORM.ARGUMENT_INVALID',
        message: 'forUpdate() takes nowait or skipLocked, not both',
        meta: { method: 'forUpdate' },
      }),
    );
  });

  describe('capabilities', () => {
    it.each([
      { method: 'forUpdate', group: 'sql' },
      { method: 'forShare', group: 'sql' },
      { method: 'forNoKeyUpdate', group: 'postgres' },
      { method: 'forKeyShare', group: 'postgres' },
    ] as const)('$method throws without $group.$method', ({ method, group }) => {
      const collection = withoutFlag(group, method);

      // @ts-expect-error the method is gated out without its flag
      expect(() => collection[method]()).toThrow(capabilityMissing(method, `${group}.${method}`));
    });

    it('checks the flag in its own group', () => {
      const collection = postsWith({
        ...allFlags,
        sql: { ...allFlags.sql, forUpdate: false },
        postgres: { ...allFlags.postgres, forUpdate: true },
      });

      // @ts-expect-error forUpdate is gated out without sql.forUpdate
      expect(() => collection.forUpdate()).toThrow(capabilityMissing('forUpdate', 'sql.forUpdate'));
    });

    it.each([
      { flag: 'lockNowait', options: { nowait: true } },
      { flag: 'lockSkipLocked', options: { skipLocked: true } },
    ] as const)('an option throws without sql.$flag', ({ flag, options }) => {
      const collection = withoutFlag('sql', flag);

      // @ts-expect-error the option is gated out without its flag
      expect(() => collection.forUpdate(options)).toThrow(
        capabilityMissing('forUpdate', `sql.${flag}`),
      );
    });
  });
});
