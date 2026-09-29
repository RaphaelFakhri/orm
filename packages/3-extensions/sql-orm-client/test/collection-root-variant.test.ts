import { PostgresContractSerializer } from '@internal/target-postgres/runtime';
import { describe, expect, it } from 'vitest';
import type { Contract as PolyContract } from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract';
import polyContractJson from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract.json' with {
  type: 'json',
};
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import executionContractJson from './fixtures/root-variant-hashes/execution/contract.json' with {
  type: 'json',
};
import executionV7ContractJson from './fixtures/root-variant-hashes/executionV7/contract.json' with {
  type: 'json',
};
import storageContractJson from './fixtures/root-variant-hashes/storage/contract.json' with {
  type: 'json',
};
import { buildTestContextFromContract, createMockRuntime } from './helpers';

const serializer = new PostgresContractSerializer();

function createPolyDb() {
  const contract = deserializePolyContract();
  return createPolyDbFromContract(contract);
}

function createPolyDbFromContract(contract: PolyContract) {
  const context = buildTestContextFromContract(contract);
  const runtime = createMockRuntime();
  return { db: orm({ runtime, context }), runtime, context, contract };
}

function deserializePolyContract(json: unknown = polyContractJson): PolyContract {
  return serializer.deserializeContract(json) as PolyContract;
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

  it('accepts another orm owner with identical context and runtime hashes', () => {
    const { db, runtime, context } = createPolyDb();
    const other = orm({ runtime, context });

    const narrowed = db.public.Task.variant(other.public.Bug);

    expect(narrowed.state.variantName).toBe('Bug');
  });

  it('accepts a separately hydrated equivalent contract root', () => {
    const receiver = createPolyDbFromContract(deserializePolyContract());
    const argument = createPolyDbFromContract(deserializePolyContract());

    const narrowed = receiver.db.public.Task.variant(argument.db.public.Bug);

    expect(narrowed.state.variantName).toBe('Bug');
  });

  it('rejects emitted storage hash mismatches', () => {
    const receiver = createPolyDbFromContract(deserializePolyContract());
    const storageMismatch = createPolyDbFromContract(deserializePolyContract(storageContractJson));

    expect(storageMismatch.contract.profileHash).toBe(receiver.contract.profileHash);
    expect(storageMismatch.contract.storage.storageHash).not.toBe(
      receiver.contract.storage.storageHash,
    );
    expectInvalidVariant(() => receiver.db.public.Task.variant(storageMismatch.db.public.Bug));
  });

  it('rejects emitted execution presence mismatches in either direction', () => {
    const withoutExecution = createPolyDbFromContract(deserializePolyContract());
    const withExecution = createPolyDbFromContract(deserializePolyContract(executionContractJson));

    expect(withExecution.contract.storage.storageHash).toBe(
      withoutExecution.contract.storage.storageHash,
    );
    expect(withExecution.contract.profileHash).toBe(withoutExecution.contract.profileHash);
    expect(withExecution.contract.execution?.executionHash).toBeDefined();
    expect(withoutExecution.contract.execution).toBeUndefined();
    expectInvalidVariant(() =>
      withoutExecution.db.public.Task.variant(withExecution.db.public.Bug),
    );
    expectInvalidVariant(() =>
      withExecution.db.public.Task.variant(withoutExecution.db.public.Bug),
    );
  });

  it('rejects emitted execution hash mismatches with matching storage and profile hashes', () => {
    const executionV4 = createPolyDbFromContract(deserializePolyContract(executionContractJson));
    const executionV7 = createPolyDbFromContract(deserializePolyContract(executionV7ContractJson));

    expect(executionV7.contract.storage.storageHash).toBe(executionV4.contract.storage.storageHash);
    expect(executionV7.contract.profileHash).toBe(executionV4.contract.profileHash);
    expect(executionV7.contract.execution?.executionHash).not.toBe(
      executionV4.contract.execution?.executionHash,
    );
    expectInvalidVariant(() => executionV4.db.public.Task.variant(executionV7.db.public.Bug));
  });

  it('executes with the receiver runtime when the argument root comes from another orm', async () => {
    const receiver = createPolyDbFromContract(deserializePolyContract());
    const argument = createPolyDbFromContract(deserializePolyContract());
    receiver.runtime.setNextResults([[{ id: 1, title: 'Crash', type: 'bug' }]]);
    argument.runtime.setNextResults([[{ id: 2, title: 'Wrong', type: 'bug' }]]);

    const rows = await receiver.db.public.Task.variant(argument.db.public.Bug)
      .select('id', 'title', 'type')
      .all()
      .toArray();

    expect(rows).toEqual([{ id: 1, title: 'Crash', type: 'bug' }]);
    expect(receiver.runtime.executions).toHaveLength(1);
    expect(argument.runtime.executions).toEqual([]);
  });

  it('rejects forged and detached arguments', () => {
    const { db } = createPolyDb();
    const forged = { namespaceId: 'public', modelName: 'Bug' };
    const detached = new Collection(
      {
        runtime: createMockRuntime(),
        context: buildTestContextFromContract(deserializePolyContract()),
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
    runtime.setNextResults([[{ id: 1, title: 'Crash', type: 'bug' }]]);

    const rows = await db.public.Task.where({ title: 'Crash' })
      .variant(db.public.Bug)
      .select('id', 'title', 'type')
      .all()
      .toArray();

    expect(rows).toEqual([{ id: 1, title: 'Crash', type: 'bug' }]);
  });
});
