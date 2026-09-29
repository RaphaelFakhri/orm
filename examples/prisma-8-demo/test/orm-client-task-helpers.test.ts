import { AsyncIterableResult } from '@prisma/orm-postgres/components/runtime';
import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import type { SqlExecutionPlan, SqlQueryPlan } from '@prisma/orm-postgres/relational-core/plan';
import { describe, expect, it } from 'vitest';
import { createOrmClient } from '../src/orm-client/client';

type RuntimePlan = SqlExecutionPlan | SqlQueryPlan<unknown>;

interface MockRuntime extends Runtime {
  readonly executions: RuntimePlan[];
  setNextResults(results: Record<string, unknown>[][]): void;
}

function createMockRuntime(): MockRuntime {
  const executions: RuntimePlan[] = [];
  let nextResults: Record<string, unknown>[][] = [];

  return {
    executions,
    setNextResults(results: Record<string, unknown>[][]) {
      nextResults = [...results];
    },
    query<Row>(plan: RuntimePlan): AsyncIterableResult<Row> {
      const rows = (nextResults.shift() ?? []) as Row[];
      executions.push(plan);
      const gen = async function* (): AsyncGenerator<Row, void, unknown> {
        for (const row of rows) {
          yield row;
        }
      };
      return new AsyncIterableResult(gen());
    },
    async execute(plan: RuntimePlan) {
      executions.push(plan);
      return { affectedRows: 0 };
    },
    async connection() {
      throw new Error('connection not implemented');
    },
    telemetry() {
      return null;
    },
    async close() {},
    async prepare() {
      throw new Error('prepare not implemented');
    },
  } as MockRuntime;
}

describe('ORM task variant helpers', () => {
  it('narrows bugs and features without helper arguments', () => {
    const db = createOrmClient(createMockRuntime());

    expect(db.Task.bugs().state.variantName).toBe('Bug');
    expect(db.Task.features().state.variantName).toBe('Feature');
  });

  it('preserves chains and reads rows through the captured bug root', async () => {
    const runtime = createMockRuntime();
    const db = createOrmClient(runtime);
    runtime.setNextResults([
      [{ id: 'task_1', title: 'Login crash', type: 'bug', userId: 'user_1', severity: 'critical' }],
    ]);

    const rows = await db.Task.bugs()
      .where({ userId: 'user_1' })
      .select('id', 'title')
      .all()
      .toArray();

    expect(rows).toEqual([{ id: 'task_1', title: 'Login crash', type: 'bug', userId: 'user_1' }]);
    expect(runtime.executions).toHaveLength(1);
  });

  it('keeps each created client bound to its own runtime', async () => {
    const firstRuntime = createMockRuntime();
    const secondRuntime = createMockRuntime();
    const first = createOrmClient(firstRuntime);
    const second = createOrmClient(secondRuntime);
    firstRuntime.setNextResults([[{ id: 'task_1', title: 'First', type: 'bug' }]]);
    secondRuntime.setNextResults([[{ id: 'task_2', title: 'Second', type: 'bug' }]]);

    const firstRows = await first.Task.bugs().select('id', 'title').all().toArray();
    const secondRows = await second.Task.bugs().select('id', 'title').all().toArray();

    expect(firstRows).toEqual([{ id: 'task_1', title: 'First', type: 'bug' }]);
    expect(secondRows).toEqual([{ id: 'task_2', title: 'Second', type: 'bug' }]);
    expect(firstRuntime.executions).toHaveLength(1);
    expect(secondRuntime.executions).toHaveLength(1);
  });
});
