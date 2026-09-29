---
changes:
  - id: sql-orm-variant-takes-model-root
    summary: "`@internal/sql-orm-client` `Collection.variant(...)` now takes an unmodified variant model root instead of a string variant name. Roots from another SQL ORM instance are accepted when the existing storage/profile/execution contract hash tuple matches; modified/query result collections, incompatible roots, detached `new Collection(...)` values, unrelated roots, non-polymorphic receivers, and string arguments are rejected with `ORM.ARGUMENT_INVALID`."
  - id: sql-orm-custom-collection-namespace-state
    summary: "Custom SQL collection subclasses used as ORM roots may need namespace-aware generic annotations, and helper methods that select variants can stay zero-argument by capturing sibling roots during client initialization."
---

## `sql-orm-variant-takes-model-root`

Update SQL extension code that calls `Collection.variant(...)` to pass a declared unmodified variant root:

```ts
const db = orm({ runtime, context })

const bugs = db.public.Task.variant(db.public.Bug)
```

A string is no longer a valid SQL ORM variant argument. The runtime also rejects values that were not registered as unmodified roots or whose contract hash tuple is incompatible with the receiver, including `new Collection(...)`, object literals with matching `namespaceId`/`modelName`, and builder results such as `db.public.Bug.where({})`. Roots from another `orm({ runtime, context })` are valid when `storage.storageHash`, `profileHash`, and optional `execution.executionHash` presence/value match.

If a test previously constructed a bare polymorphic receiver with `new Collection(...)` and then called `.variant('Bug')`, construct the receiver through `orm({ runtime, context })` and pass the sibling root from that same returned ORM value:

```ts
const db = orm({ runtime, context })

const selected = db.public.Task.where({ title: 'Crash' }).variant(db.public.Bug)
```

Keep Mongo extension or app code on string variant names. Do not apply a global `variant('Name')` rewrite unless the file is known to use the SQL ORM client.

## `sql-orm-custom-collection-namespace-state`

Custom SQL collection roots still work, but root identity is attached to the root objects created by `orm(...)`. If a custom helper narrows to a variant, capture the sibling roots while initializing the client and forward those roots to `this.variant(...)`:

```ts
type DemoOrm = ReturnType<typeof orm<Contract>>['public']
type BugRoot = DemoOrm['Bug']

type PublicRootState = Omit<DefaultCollectionTypeState, 'nsId'> & { readonly nsId: 'public' }

type TaskVariantRoots = { readonly Bug: BugRoot }

function createTaskCollection(getRoots: () => TaskVariantRoots) {
  return class TaskCollection extends Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState> {
    bugs() {
      return this.variant(getRoots().Bug)
    }
  }
}
```

Use the namespace that owns the custom collection in the state type. This preserves the root's namespace for the `variant(...)` argument type without adding a public sibling resolver, constructing a second ORM inside the collection, or storing roots in mutable module-global state. If your subclass does not call `variant(...)` or expose helpers that do, it may not need a source change.
