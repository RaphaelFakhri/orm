import type { Scalars } from '@internal/sql-contract/types';
import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import type {
  Contract as PolyContract,
  Models as PolyModels,
} from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract';
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import type { VariantModelRow } from '../src/types';
import { createMockRuntime } from './helpers';

declare const context: ExecutionContext<PolyContract>;

const db = orm({ runtime: createMockRuntime(), context });
const taskRoot = db.public.Task;
const bugRoot = db.public.Bug;
const featureRoot = db.public.Feature;
const projectRoot = db.public.Project;
const variantName = Math.random() > 0.5 ? 'Bug' : 'Feature';
const variantRoot = Math.random() > 0.5 ? bugRoot : featureRoot;
const bugBuilderResult = bugRoot.where({});

test('variant accepts same-namespace model roots and rejects non-root arguments', () => {
  type VariantArg = Parameters<typeof taskRoot.variant>[0];

  expectTypeOf<typeof bugRoot>().toExtend<VariantArg>();
  expectTypeOf<typeof featureRoot>().toExtend<VariantArg>();
  expectTypeOf<string>().not.toExtend<VariantArg>();
  expectTypeOf<typeof variantName>().not.toExtend<VariantArg>();
  expectTypeOf<typeof bugBuilderResult>().not.toExtend<VariantArg>();
  expectTypeOf<typeof projectRoot>().not.toExtend<VariantArg>();
});

test('variant narrows rows with the receiver namespace', () => {
  const bugs = taskRoot.variant(bugRoot);
  const features = taskRoot.variant(featureRoot);
  const selected = projectRoot.include('tasks', (tasks) => tasks.variant(bugRoot));

  expectTypeOf<VariantModelRow<PolyContract, 'Task', 'Bug', 'public'>>().toEqualTypeOf<
    Scalars<PolyModels.public_Bug>
  >();
  expectTypeOf<
    Awaited<ReturnType<typeof bugs.first>>
  >().toEqualTypeOf<Scalars<PolyModels.public_Bug> | null>();
  expectTypeOf<
    Awaited<ReturnType<typeof features.first>>
  >().toEqualTypeOf<Scalars<PolyModels.public_Feature> | null>();
  expectTypeOf<
    NonNullable<Awaited<ReturnType<typeof selected.first>>>['tasks'][number]
  >().toEqualTypeOf<Scalars<PolyModels.public_Bug>>();
});

test('variant supports union-valued root arguments', () => {
  const selected = taskRoot.variant(variantRoot);
  expectTypeOf<Awaited<ReturnType<typeof selected.first>>>().toEqualTypeOf<
    Scalars<PolyModels.public_Bug> | Scalars<PolyModels.public_Feature> | null
  >();
});

test('non-polymorphic receivers reject variant roots', () => {
  type VariantArg = Parameters<typeof projectRoot.variant>[0];
  expectTypeOf<typeof bugRoot>().not.toExtend<VariantArg>();
});

class TaskCollection extends Collection<PolyContract, 'Task'> {}

const customDb = orm({
  runtime: createMockRuntime(),
  context,
  collections: { Task: TaskCollection },
});
test('custom roots carry root identity without rebinding the subclass surface', () => {
  type VariantArg = Parameters<typeof taskRoot.variant>[0];
  expectTypeOf<typeof customDb.public.Bug>().toExtend<VariantArg>();
});
