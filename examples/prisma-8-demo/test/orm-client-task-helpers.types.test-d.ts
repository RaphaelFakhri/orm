import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import { expectTypeOf, test } from 'vitest';
import type { createOrmClient } from '../src/orm-client/client';
import type { Models } from '../src/prisma/contract.d';

declare const db: ReturnType<typeof createOrmClient>;

test('task helpers return precise variant rows', () => {
  const bugs = db.Task.bugs();
  const features = db.Task.features();

  expectTypeOf<
    Awaited<ReturnType<typeof bugs.first>>
  >().toEqualTypeOf<Scalars<Models.public_Bug> | null>();
  expectTypeOf<
    Awaited<ReturnType<typeof features.first>>
  >().toEqualTypeOf<Scalars<Models.public_Feature> | null>();
});

test('task helper write inputs stay variant-specific', () => {
  db.Task.bugs().create({ title: 'Crash', userId: 'user_1', severity: 'critical' });
  db.Task.features().create({ title: 'Export', userId: 'user_1', priority: 'P1' });

  db.Task.bugs().create({
    title: 'Wrong',
    userId: 'user_1',
    // @ts-expect-error priority belongs to Feature creation
    priority: 'P1',
  });
  db.Task.features().create({
    title: 'Wrong',
    userId: 'user_1',
    // @ts-expect-error severity belongs to Bug creation
    severity: 'critical',
  });
});

test('task helper rows reject unrelated variant-only properties', () => {
  const bug = db.Task.bugs().first();
  const feature = db.Task.features().first();

  type BugRow = NonNullable<Awaited<typeof bug>>;
  type FeatureRow = NonNullable<Awaited<typeof feature>>;

  expectTypeOf<BugRow>().toHaveProperty('severity');
  expectTypeOf<FeatureRow>().toHaveProperty('priority');

  function rejectCrossVariantProperties(bugRow: BugRow, featureRow: FeatureRow) {
    // @ts-expect-error priority belongs to Feature rows
    bugRow.priority;
    // @ts-expect-error severity belongs to Bug rows
    featureRow.severity;
  }
  expectTypeOf(rejectCrossVariantProperties).returns.toEqualTypeOf<void>();
});

test('task helpers preserve existing collection APIs and precise return types', () => {
  const filteredTask = db.Task.where((task) => task.title.eq('Crash'));
  const filteredBug = db.Task.forUser('user_1').variant(db.Bug);
  const createdBug = db.Task.bugs()
    .where((bug) => bug.severity.eq('critical'))
    .create({
      title: 'Crash',
      userId: 'user_1',
      severity: 'critical',
    });

  expectTypeOf<Awaited<ReturnType<typeof filteredTask.first>>>().toEqualTypeOf<
    Awaited<ReturnType<typeof db.Task.first>>
  >();
  expectTypeOf<
    Awaited<ReturnType<typeof filteredBug.first>>
  >().toEqualTypeOf<Scalars<Models.public_Bug> | null>();
  expectTypeOf<Awaited<typeof createdBug>>().toEqualTypeOf<Scalars<Models.public_Bug>>();
});
