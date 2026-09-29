---
changes:
  - id: sql-orm-variant-roots-use-compatible-contract-hashes
    summary: "`@internal/sql-orm-client` `Collection.variant(...)` now accepts registered unmodified roots from another SQL ORM client when the existing storage/profile/execution contract hash tuple matches. Root registration still rejects forged, detached, modified, undeclared, or incompatible roots."
  - id: sql-orm-custom-variant-helpers-capture-roots
    summary: "Extension-owned custom SQL collection helpers that narrow to sibling variants can stay zero-argument by capturing eligible roots during client initialization."
---

## `sql-orm-variant-roots-use-compatible-contract-hashes`

If extension tests or helper code created multiple SQL ORM clients from equivalent contracts, you no longer need to thread roots from the exact same `orm(...)` invocation. A root is compatible when `storage.storageHash`, `profileHash`, and optional `execution.executionHash` presence/value match the receiver contract. The receiver still checks namespace/model membership against its declared variants and uses only its own runtime or transaction for execution.

Keep constructing variant roots through `orm(...)`. Do not pass object literals, detached `new Collection(...)` instances, modified builder results, or roots from contracts with different hash tuples.

## `sql-orm-custom-variant-helpers-capture-roots`

Custom collection classes that expose variant helpers can keep zero-argument methods by accepting a root getter from the client factory:

```ts
type TaskVariantRoots = { readonly Bug: BugRoot }

function createTaskCollection(getRoots: () => TaskVariantRoots) {
  return class TaskCollection extends Collection<Contract, 'Task', DemoRow<'Task'>, PublicRootState> {
    bugs() {
      return this.variant(getRoots().Bug)
    }
  }
}
```

Initialize the roots in the same factory that calls `orm(...)`, after the client is created and before returning it. Do not add a public sibling resolver, create a second ORM/runtime inside the collection, or share roots through mutable module-global state.
