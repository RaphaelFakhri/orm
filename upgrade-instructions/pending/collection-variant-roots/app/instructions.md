---
changes:
  - id: sql-orm-variant-takes-model-root
    summary: SQL ORM `collection.variant(...)` takes an unmodified variant model root from the same ORM instance instead of a string variant name. Modified/query result collections, roots from another ORM instance, unrelated roots, non-polymorphic receivers, and string arguments are rejected with `ORM.ARGUMENT_INVALID`. Mongo `variant('Name')` calls are unchanged.
  - id: sql-orm-custom-variant-helpers-take-root-arguments
    summary: Custom SQL collection helpers that previously selected a sibling variant internally now need the caller to pass the sibling root explicitly, and custom collection subclass annotations may need namespace-aware collection state so the root argument type is preserved.
---

## `sql-orm-variant-takes-model-root`

Replace SQL ORM string variant selection with the variant model root from the same ORM value that owns the receiving collection. Do not use a root from a new `orm(...)` call, do not pass a forged object, and do not pass a query derived from the root such as `db.orm.public.Bug.where({})`.

```ts
db.orm.public.Task.variant('Bug')
db.orm.public.Task.variant(db.orm.public.Bug)
```

If your code stores the namespace facet in a local variable, pass the root from that same local facet:

```ts
const db = createOrmClient(runtime)

await db.Task.variant('Feature').all()
await db.Task.variant(db.Feature).all()
```

Inside relation include refinements, pass the sibling root from the outer ORM instance, not from the refinement argument:

```ts
const db = createOrmClient(runtime)

return db.User.include('tasks', (tasks) => tasks.variant(db.Bug)).all()
```

Do not run a global `.variant('...')` replacement across the repository. Mongo ORM code still uses string variant names. Limit this migration to SQL ORM imports/clients such as `@prisma/orm-postgres/orm-client`, `@prisma/orm-sqlite/orm-client`, and `@internal/sql-orm-client`.

## `sql-orm-custom-variant-helpers-take-root-arguments`

For custom SQL collection helpers, make the caller pass the eligible variant root and forward that argument to `this.variant(...)`. Do not add `this.orm`, construct another ORM instance, or add a sibling-name resolver inside the collection.

```ts
type DemoOrm = ReturnType<typeof orm<Contract>>['public']
type BugRoot = DemoOrm['Bug']
type FeatureRoot = DemoOrm['Feature']

export class TaskCollection extends Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState> {
  bugs(bug: BugRoot) {
    return this.variant(bug)
  }

  features(feature: FeatureRoot) {
    return this.variant(feature)
  }
}
```

Then update call sites to pass the same ORM instance's roots:

```ts
const db = createOrmClient(runtime)

await db.Task.bugs(db.Bug).all()
await db.Task.features(db.Feature).all()
```

If a custom subclass currently extends `Collection<Contract, 'Task'>` and TypeScript no longer knows the namespace of its roots, mirror the demo shape: derive row/root types from the ORM factory return type, widen the collection generic with the row type, and use a state type that fixes `nsId` to the namespace that owns the custom root. The migrated demo used `Omit<DefaultCollectionTypeState, 'nsId'> & { readonly nsId: 'public' }` for its `public` namespace collections.
