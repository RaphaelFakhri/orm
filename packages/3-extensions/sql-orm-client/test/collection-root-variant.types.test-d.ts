import type { Scalars } from '@internal/sql-contract/types';
import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { expectTypeOf, test } from 'vitest';
import type {
  Contract as PolyContract,
  Models as PolyModels,
} from '../../../../test/integration/test/sql-orm-client/fixtures/polymorphism/generated/contract';
import { Collection } from '../src/collection';
import { orm } from '../src/orm';
import type {
  CollectionTypeState,
  DefaultCollectionTypeState,
  InferRootRow,
  VariantModelRow,
  WithNsId,
} from '../src/types';
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
const bugIncludeResult = bugRoot.include('assignee');
const bugSelectResult = bugRoot.select('severity');
const bugOrderResult = bugRoot.orderBy((bug) => bug.severity.asc());
const bugCursorResult = bugRoot.orderBy((bug) => bug.severity.asc()).cursor({});
const bugDistinctResult = bugRoot.distinct('severity');
const bugDistinctOnResult = bugRoot.orderBy((bug) => bug.severity.asc()).distinctOn('severity');
const bugLimitResult = bugRoot.limit(1);
const bugOffsetResult = bugRoot.offset(1);
const selectedVariantResult = taskRoot.variant(bugRoot);
const cleanOrModifiedVariantRoot = Math.random() > 0.5 ? bugRoot : bugBuilderResult;
declare const directBugRoot: Collection<
  PolyContract,
  'Bug',
  InferRootRow<PolyContract, 'Bug', 'public'>,
  WithNsId<DefaultCollectionTypeState, 'public'>
>;
declare const unknownModifiedBugRoot: Collection<
  PolyContract,
  'Bug',
  InferRootRow<PolyContract, 'Bug', 'public'>,
  Omit<WithNsId<DefaultCollectionTypeState, 'public'>, 'queryModified'> & {
    readonly queryModified: boolean;
  }
>;

test('variant accepts same-namespace model roots and rejects non-root arguments', () => {
  type VariantArg = Parameters<typeof taskRoot.variant>[0];
  type QueryModifiedOf<Root> =
    Root extends Collection<PolyContract, string, unknown, infer State extends CollectionTypeState>
      ? State['queryModified']
      : never;

  taskRoot.variant(bugRoot);
  taskRoot.variant(featureRoot);
  taskRoot.variant(directBugRoot);
  expectTypeOf<typeof bugRoot>().toExtend<VariantArg>();
  expectTypeOf<typeof featureRoot>().toExtend<VariantArg>();
  expectTypeOf<typeof directBugRoot>().toExtend<VariantArg>();
  expectTypeOf<string>().not.toExtend<VariantArg>();
  expectTypeOf<typeof variantName>().not.toExtend<VariantArg>();
  expectTypeOf<QueryModifiedOf<typeof bugBuilderResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugIncludeResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugSelectResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugOrderResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugCursorResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugDistinctResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugDistinctOnResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugLimitResult>>().toEqualTypeOf<true>();
  expectTypeOf<QueryModifiedOf<typeof bugOffsetResult>>().toEqualTypeOf<true>();
  expectTypeOf<typeof projectRoot>().not.toExtend<VariantArg>();

  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugBuilderResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugIncludeResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugSelectResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugOrderResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugCursorResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugDistinctResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugDistinctOnResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugLimitResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(bugOffsetResult);
  // @ts-expect-error variant requires an unmodified model root
  taskRoot.variant(selectedVariantResult);
  // @ts-expect-error variant requires every union member to be an unmodified model root
  taskRoot.variant(cleanOrModifiedVariantRoot);
  // @ts-expect-error variant requires queryModified to be statically false
  taskRoot.variant(unknownModifiedBugRoot);
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
