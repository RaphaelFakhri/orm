---
changes:
  - id: non-data-drops-are-widening
    summary: |
      Dropping an index, a unique, primary-key or foreign-key constraint, a check constraint, a row-level-security policy, a column default or a Postgres enum type, and disabling row-level security on a table, is now a `widening` operation, not a `destructive` one, because it loses no stored data. `db update` and `migration plan`'s baseline confirmation no longer ask for consent for them, and a policy that allows `widening` but not `destructive` now plans them. Do not re-emit existing migrations that call the matching migration methods.
    detection:
      glob: "**/migration.ts"
      matches:
        - '(?<![\w$])(?<![\w$]\.)this\.(?:dropIndex|dropConstraint|dropCheckConstraint|dropRlsPolicy|disableRowLevelSecurity|dropDefault|dropNativeEnumType)\('
---

## `non-data-drops-are-widening`

An operation is `destructive` only when applying it can lose rows or stored values: dropping a table, dropping a column, and narrowing a column's type or nullability. Everything the contract can recreate is now `widening`:

- On Postgres: dropping an index, a unique, primary-key or foreign-key constraint, a check constraint, a row-level-security policy, a column default, and a native enum type; and disabling row-level security on a table.
- On SQLite: dropping an index. A table rebuild that only changes a primary key, a foreign key, a unique constraint or a column default is `widening`; a rebuild that changes a column's type or makes it non-nullable stays `destructive`.

What changes for you:

1. `prisma db update` no longer asks you to type the database name, and no longer needs `--confirm` in CI, for a plan whose only drops are of these kinds. `prisma migration plan` likewise no longer asks for the project directory name, or needs `--no-interactive --confirm <directory>`, for a baseline whose only drops are of these kinds. A plan that drops a table or a column still asks.
2. Dropping a row-level-security policy, or disabling row-level security on a table, loses no data but can widen who sees which rows. Read the plan before applying it if your schema relies on policies.
3. An existing migration on disk keeps the `ops.json` and the hash it was written with, so `migrate` applies it as before. Do not re-run the `migration.ts` of an existing migration that calls `this.dropIndex`, `this.dropConstraint`, `this.dropCheckConstraint`, `this.dropRlsPolicy`, `this.disableRowLevelSecurity`, `this.dropDefault` or `this.dropNativeEnumType`: it would now write `operationClass: "widening"` for those operations, a different `ops.json` and a different migration hash, which `prisma migration check` reports as a changed migration. If you re-emitted one, restore its `ops.json` and `migration.json` from version control.

The detection finds `migration.ts` files that call one of the seven methods on `this`. MongoDB migrations call `dropIndex(...)` as a plain function, which the detection does not match, and their operations did not change.
