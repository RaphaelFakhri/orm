import type { ProjectionItem } from '@internal/sql-relational-core/ast';
import { blindCast } from '@internal/utils/casts';
import { describe, expect, it } from 'vitest';
import type { Collection } from '../src/collection';
import { orm } from '../src/orm';
import {
  buildMixedPolyContract,
  createMockRuntime,
  getTestContext,
  isSelectAst,
  type MockRuntime,
} from './helpers';

interface RuntimeRows {
  toArray(): Promise<Record<string, unknown>[]>;
}

interface RuntimeCollection {
  variant(root: RuntimeCollection): RuntimeCollection;
  select(...fields: string[]): RuntimeCollection;
  include(
    relationName: string,
    refine: (collection: RuntimeCollection) => RuntimeCollection,
  ): RuntimeCollection;
  all(): RuntimeRows;
}

function createVariantTaskCollection(): {
  readonly tasks: RuntimeCollection;
  readonly featureRoot: RuntimeCollection;
  readonly bugRoot: RuntimeCollection;
  readonly runtime: MockRuntime;
} {
  const contract = buildMixedPolyContract();
  const context = { ...getTestContext(), contract };
  const runtime = createMockRuntime();
  const db = blindCast<
    {
      public: {
        Task: Collection<ReturnType<typeof buildMixedPolyContract>, 'Task'>;
        Feature: Collection<ReturnType<typeof buildMixedPolyContract>, 'Feature'>;
        Bug: Collection<ReturnType<typeof buildMixedPolyContract>, 'Bug'>;
      };
    },
    'patched mixed polymorphism test contract adds Task variants outside the static fixture type'
  >(orm({ runtime, context }));
  return {
    tasks: blindCast<RuntimeCollection, 'runtime collection surface for fixture-generated root'>(
      db.public.Task,
    ),
    featureRoot: blindCast<
      RuntimeCollection,
      'runtime collection surface for fixture-generated root'
    >(db.public.Feature),
    bugRoot: blindCast<RuntimeCollection, 'runtime collection surface for fixture-generated root'>(
      db.public.Bug,
    ),
    runtime,
  };
}

function selectedTaskWithAssignee(
  tasks: RuntimeCollection,
  variantRoot: RuntimeCollection,
): RuntimeRows {
  return tasks
    .variant(variantRoot)
    .select('id', 'title', 'type')
    .include('assignee', (assignee) => assignee.select('id', 'name'))
    .all();
}

function projectionAliases(runtime: MockRuntime): string[] {
  const ast = runtime.executions[0]?.plan.ast;
  expect(isSelectAst(ast)).toBe(true);
  if (!isSelectAst(ast)) {
    throw new Error('Expected variant include dispatch to execute a select plan');
  }
  return ast.projection.map((item: ProjectionItem) => item.alias);
}

describe('variant-owned include dispatch', () => {
  it('maps an explicitly selected MTI result without leaking internal relation columns', async () => {
    const { tasks, featureRoot, runtime } = createVariantTaskCollection();
    runtime.setNextResults([
      [
        {
          id: 2,
          title: 'Dark mode',
          type: 'feature',
          assignee: '[{"id":42,"name":"Ada"}]',
        },
      ],
    ]);

    const rows = await selectedTaskWithAssignee(tasks, featureRoot).toArray();

    expect(rows).toEqual([
      {
        id: 2,
        title: 'Dark mode',
        type: 'feature',
        assignee: { id: 42, name: 'Ada' },
      },
    ]);
    expect(projectionAliases(runtime)).toEqual(['id', 'title', 'type', 'assignee']);
  });

  it('maps the whole STI result without projecting an unselected variant join key', async () => {
    const { tasks, bugRoot, runtime } = createVariantTaskCollection();
    runtime.setNextResults([
      [
        {
          id: 1,
          title: 'Crash',
          type: 'bug',
          assignee: '[{"id":11,"name":"Grace"}]',
        },
      ],
    ]);

    const rows = await selectedTaskWithAssignee(tasks, bugRoot).toArray();

    expect(rows).toEqual([
      {
        id: 1,
        title: 'Crash',
        type: 'bug',
        assignee: { id: 11, name: 'Grace' },
      },
    ]);
    expect(projectionAliases(runtime)).toEqual(['id', 'title', 'type', 'assignee']);
  });
});
