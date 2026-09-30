---
changes:
  - id: sql-orm-variant-takes-model-root
    summary: SQL ORM `collection.variant(...)` takes a genuine, unmodified variant model collection instead of a string variant name. Directly constructed collections and roots from separately created SQL ORM clients are accepted when the existing storage/profile/execution contract hash tuple matches; modified/query result collections, incompatible roots, unrelated roots, non-polymorphic receivers, forged objects, and string arguments are rejected with `ORM.ARGUMENT_INVALID`. Mongo `variant('Name')` calls are unchanged.
  - id: sql-orm-custom-variant-helpers-capture-roots
    summary: Custom SQL collection helpers that previously selected a sibling variant internally can stay zero-argument by closing over eligible sibling roots during client initialization; custom collection subclass annotations may need namespace-aware collection state so captured roots remain typed.
---

## `sql-orm-variant-takes-model-root`

Replace SQL ORM string variant selection with a genuine, unmodified variant model collection. Use a root from the same SQL ORM value when it is naturally in scope; a root from another SQL ORM client or direct `Collection` construction is also valid when both sides use contracts with the same `storage.storageHash`, `profileHash`, and optional `execution.executionHash` presence/value. Do not pass a forged object, an incompatible-contract root, or a query derived from the root such as `db.orm.public.Bug.where({})`. No-op builder calls still count as modified query state, so `where({})` and empty `cursor({})` results are rejected rather than silently ignored.

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

## `sql-orm-custom-variant-helpers-capture-roots`

For custom SQL collection helpers, keep zero-argument methods by capturing eligible sibling collections during client initialization and forwarding those unmodified collections to `this.variant(...)`. Do not add `this.orm`, construct another ORM instance inside the collection, add a sibling-name resolver, or store the roots in mutable module-global state.

```ts
type DemoOrm = ReturnType<typeof orm<Contract>>['public']
type BugRoot = DemoOrm['Bug']
type FeatureRoot = DemoOrm['Feature']

type TaskVariantRoots = { readonly Bug: BugRoot; readonly Feature: FeatureRoot }

function createTaskCollection(getRoots: () => TaskVariantRoots) {
  return class TaskCollection extends Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState> {
    bugs() {
      return this.variant(getRoots().Bug)
    }

    features() {
      return this.variant(getRoots().Feature)
    }
  }
}
```

Then initialize the helper with per-client roots before returning the client:

```ts
let roots: TaskVariantRoots | undefined
const TaskCollection = createTaskCollection(() => {
  if (roots === undefined) throw new Error('Task variant roots are not initialized')
  return roots
})
const db = orm({ runtime, context, collections: { Task: TaskCollection } }).public
roots = { Bug: db.Bug, Feature: db.Feature }

await db.Task.bugs().all()
await db.Task.features().all()
```

If a custom subclass currently extends `Collection<Contract, 'Task'>` and TypeScript no longer knows the namespace of its roots, mirror the demo shape: derive row/root types from the ORM factory return type, widen the collection generic with the row type, and use a state type that fixes `nsId` to the namespace that owns the custom root. The migrated demo used `Omit<DefaultCollectionTypeState, 'nsId'> & { readonly nsId: 'public' }` for its `public` namespace collections. Named client return aliases are not required for normal factory usage.
