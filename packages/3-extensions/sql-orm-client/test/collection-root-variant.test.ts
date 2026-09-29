import { PostgresContractSerializer } from '@internal/target-postgres/runtime';
import { describe, expect, it } from 'vitest';
import type { Contract as PolyContract } from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract';
import polyContractJson from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract.json' with {
  type: 'json',
};
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import { buildTestContextFromContract, createMockRuntime } from './helpers';

const serializer = new PostgresContractSerializer();

function createPolyDb() {
  const contract = serializer.deserializeContract(polyContractJson) as PolyContract;
  const context = buildTestContextFromContract(contract);
  const runtime = createMockRuntime();
  return { db: orm({ runtime, context }), runtime, context };
}

function expectInvalidVariant(call: () => unknown) {
  expect(call).toThrow(
    expect.objectContaining({
      code: 'ORM.ARGUMENT_INVALID',
    }),
  );
}

describe('Collection.variant() root arguments', () => {
  it('accepts an unmodified same-instance declared root', () => {
    const { db } = createPolyDb();

    const narrowed = db.public.Task.variant(db.public.Bug);

    expect(narrowed.state.variantName).toBe('Bug');
    expect(narrowed.state.filters).toHaveLength(1);
  });

  it('rejects strings', () => {
    const { db } = createPolyDb();

    expectInvalidVariant(() => db.public.Task.variant('Bug' as never));
  });

  it('rejects another orm owner with identical context and runtime', () => {
    const { db, runtime, context } = createPolyDb();
    const other = orm({ runtime, context });

    expectInvalidVariant(() => db.public.Task.variant(other.public.Bug));
  });

  it('rejects forged and detached arguments', () => {
    const { db } = createPolyDb();
    const forged = { namespaceId: 'public', modelName: 'Bug' };
    const detached = new Collection(
      {
        runtime: createMockRuntime(),
        context: buildTestContextFromContract(
          serializer.deserializeContract(polyContractJson) as PolyContract,
        ),
      },
      'Bug',
      {
        namespaceId: 'public',
      },
    );

    expectInvalidVariant(() => db.public.Task.variant(forged as never));
    expectInvalidVariant(() => db.public.Task.variant(detached as never));
  });

  it('rejects non-polymorphic receivers and undeclared roots', () => {
    const { db } = createPolyDb();

    expectInvalidVariant(() => db.public.Project.variant(db.public.Bug as never));
    expectInvalidVariant(() => db.public.Task.variant(db.public.Project as never));
  });

  it('rejects no-op builder results while preserving the original root', () => {
    const { db } = createPolyDb();
    const builderResult = db.public.Bug.where({});

    expectInvalidVariant(() => db.public.Task.variant(builderResult as never));
    expect(db.public.Task.variant(db.public.Bug).state.variantName).toBe('Bug');
  });

  it('keeps receiver owner through chains and runtime swaps', async () => {
    const { db, runtime } = createPolyDb();
    runtime.setNextResults([[{ id: 1, title: 'Crash', type: 'bug', severity: 'critical' }]]);

    const rows = await db.public.Task.where({ title: 'Crash' })
      .variant(db.public.Bug)
      .all()
      .toArray();

    expect(rows).toEqual([{ id: 1, title: 'Crash', type: 'bug', severity: 'critical' }]);
  });
});
