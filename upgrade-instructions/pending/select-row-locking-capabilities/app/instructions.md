---
changes:
  - id: re-emit-for-the-row-locking-capabilities
    summary: "The Postgres adapter reports seven new capability keys (sql.forUpdate, sql.forShare, sql.lockOf, sql.lockNowait, sql.lockSkipLocked, postgres.forNoKeyUpdate, postgres.forKeyShare), which gate the new row-locking methods on the SQL builder and the ORM client; a contract emitted before this release does not carry them and the methods are unavailable against it, so re-emit the contract before using them."
    detection:
      glob: "**/contract.json"
      contains:
        - '"distinctOn"'
---

## `re-emit-for-the-row-locking-capabilities`

The typed SQL builder gains four methods that lock the rows a select reads, named after the SQL they render: `forUpdate()`, `forNoKeyUpdate()`, `forShare()` and `forKeyShare()`. Each takes an optional `{ of, nowait, skipLocked }`: `of` names the tables or aliases to lock, and `nowait` and `skipLocked` exclude each other. A lock lasts until the transaction ends, so use it inside `db.transaction(...)`:

```ts
await db.transaction(async (tx) => {
  const [job] = await tx.query(
    tx.sql.public.job
      .select('id')
      .where((f, fns) => fns.eq(f.state, 'queued'))
      .limit(1)
      .forUpdate({ skipLocked: true })
      .build(),
  );
});
```

The ORM client's collections gain the same four methods. Each takes an optional `{ nowait, skipLocked }`, which exclude each other; there is no `of`, because the ORM always locks only the model's own table:

```ts
await db.transaction(async (tx) => {
  const job = await tx.orm.public.Job.where({ state: 'queued' })
    .orderBy((j) => j.createdAt.asc())
    .forUpdate({ skipLocked: true })
    .first();
});
```

On the ORM a lock cannot be combined with `include`, `groupBy`, `aggregate`, `distinct`, `distinctOn` or a mutation terminal; those throw `ORM.LOCK_INCOMPATIBLE`.

Each method and each option is gated on a capability key that the Postgres adapter now reports: `sql.forUpdate`, `sql.forShare`, `postgres.forNoKeyUpdate`, `postgres.forKeyShare`, and `sql.lockOf`, `sql.lockNowait`, `sql.lockSkipLocked` for the options. A `contract.json` emitted before this release carries none of them, so the methods do not exist on its builder or its collections.

Re-emit your contract to pick up the keys:

```console
prisma contract emit
```

Nothing else changes. The keys are additive, the storage hash does not move, and every existing query behaves exactly as before. You only need to re-emit if you want to use the new methods. SQLite reports none of the keys, because SQLite has no row locks.
