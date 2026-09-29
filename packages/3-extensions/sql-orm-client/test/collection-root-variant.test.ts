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
  return createPolyDbFromContract(contract);
}

function createPolyDbFromContract(contract: PolyContract) {
  const context = buildTestContextFromContract(contract);
  const runtime = createMockRuntime();
  return { db: orm({ runtime, context }), runtime, context, contract };
}

function deserializePolyContract(): PolyContract {
  return serializer.deserializeContract(polyContractJson) as PolyContract;
}

function withStorageHash(contract: PolyContract, storageHash: string): PolyContract {
  return {
    ...contract,
    storage: {
      ...contract.storage,
      storageHash: storageHash as PolyContract['storage']['storageHash'],
    },
  };
}

function withProfileHash(contract: PolyContract, profileHash: string): PolyContract {
  return { ...contract, profileHash: profileHash as PolyContract['profileHash'] };
}

function withExecutionHash(contract: PolyContract, executionHash: string): PolyContract {
  return {
    ...contract,
    execution: { executionHash, mutations: { defaults: [] } },
  } as unknown as PolyContract;
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

  it('rejects isolated hash tuple mismatches', () => {
    const contract = deserializePolyContract();
    const receiver = createPolyDbFromContract(contract);

    const storageMismatch = createPolyDbFromContract(
      withStorageHash(contract, 'different-storage'),
    );
    const profileMismatch = createPolyDbFromContract(
      withProfileHash(contract, 'different-profile'),
    );
    const executionPresenceMismatch = createPolyDbFromContract(
      withExecutionHash(contract, 'different-execution'),
    );

    expectInvalidVariant(() => receiver.db.public.Task.variant(storageMismatch.db.public.Bug));
    expectInvalidVariant(() => receiver.db.public.Task.variant(profileMismatch.db.public.Bug));
    expectInvalidVariant(() =>
      receiver.db.public.Task.variant(executionPresenceMismatch.db.public.Bug),
    );
  });

  it('rejects execution hash mismatches and absence mismatches in either direction', () => {
    const contract = deserializePolyContract();
    const withExecution = withExecutionHash(contract, 'execution-a');
    const receiver = createPolyDbFromContract(withExecution);
    const samePresenceDifferentHash = createPolyDbFromContract(
      withExecutionHash(contract, 'execution-b'),
    );
    const missingExecution = createPolyDbFromContract(contract);

    expectInvalidVariant(() =>
      receiver.db.public.Task.variant(samePresenceDifferentHash.db.public.Bug),
    );
    expectInvalidVariant(() => receiver.db.public.Task.variant(missingExecution.db.public.Bug));
  });

  it('executes with the receiver runtime when the argument root comes from another orm', async () => {
    const receiver = createPolyDbFromContract(deserializePolyContract());
    const argument = createPolyDbFromContract(deserializePolyContract());
    receiver.runtime.setNextResults([
      [{ id: 1, title: 'Crash', type: 'bug', severity: 'critical' }],
    ]);
    argument.runtime.setNextResults([[{ id: 2, title: 'Wrong', type: 'bug', severity: 'low' }]]);

    const rows = await receiver.db.public.Task.variant(argument.db.public.Bug).all().toArray();

    expect(rows).toEqual([{ id: 1, title: 'Crash', type: 'bug', severity: 'critical' }]);
    expect(receiver.runtime.executions).toHaveLength(1);
    expect(argument.runtime.executions).toEqual([]);
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
