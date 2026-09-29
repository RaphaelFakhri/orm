---
changes:
  - id: sql-orm-variant-roots-use-compatible-contract-hashes
    summary: SQL ORM variant roots no longer need to come from the same client instance; roots from another SQL ORM client are valid when the existing storage/profile/execution contract hash tuple matches. Incompatible roots are still rejected, and execution stays on the receiver collection.
  - id: sql-orm-custom-variant-helpers-capture-roots
    summary: Custom SQL collection helpers that narrow to sibling variants should keep zero-argument methods by capturing eligible sibling roots during client initialization instead of requiring callers to pass the root on every helper call.
---

## `sql-orm-variant-roots-use-compatible-contract-hashes`

If you changed helper or application code only to satisfy the earlier same-client root restriction, you can simplify it. `collection.variant(root)` now accepts an unmodified root from another SQL ORM client when the receiver and argument contracts have the same `storage.storageHash`, `profileHash`, and optional `execution.executionHash` presence/value. The receiver still validates that the root's namespace/model is a declared variant and still executes using only the receiver runtime or transaction.

Keep passing an unmodified model root, not a string, forged object, detached `new Collection(...)`, or builder result such as `db.Bug.where({})`.

## `sql-orm-custom-variant-helpers-capture-roots`

For custom helpers such as task variant scopes, keep the public helper zero-argument and capture roots when creating the client:

```ts
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

let roots: TaskVariantRoots
const TaskCollection = createTaskCollection(() => roots)
const db = orm({ runtime, context, collections: { Task: TaskCollection } }).public
roots = { Bug: db.Bug, Feature: db.Feature }

await db.Task.bugs().all()
await db.Task.features().all()
```

Do not create another runtime or ORM client inside the collection, add `this.orm`, expose a public sibling resolver, or store the roots in mutable module-global state.
