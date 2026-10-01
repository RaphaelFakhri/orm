# Project spec — Rename hints in the contract source

**Linear:** [Rename hints in the contract source](https://linear.app/prisma-company/project/rename-hints-in-the-contract-source-7626c0107cd9) ([TML-3421](https://linear.app/prisma-company/issue/TML-3421)) · **Branch:** `tml-3421-rename-hints`

## Purpose

The migration planner diffs two states and cannot tell intent from the diff. A renamed model or field looks exactly like a drop and a create, and planning that loses the rows. Today the only way to state a table rename is a hand-written migration ([prisma/orm#30331](https://github.com/prisma/orm/pull/30331)), and a field rename has no route at all. Projects that use `db update` and keep no migration history cannot hand-write anything.

This project gives the user a way to state, in the contract source, the one fact the diff cannot infer: this thing used to be that thing. With it, `migration plan`, `db update` and `db init` plan the rename themselves.

## At a glance

A user renames the `Profile` model to `User` and its `first_name` column to `firstName`:

```prisma
model User {
  id        Int    @id
  firstName String @hint(was: "first_name")

  @@hint(was: "Profile")
}
```

`prisma migration plan` writes a migration that renames the table, renames the column, and renames every constraint and index whose name derives from either. `prisma db update` does the same against a live database. Once an environment has been updated, the hints match nothing and do nothing. The user can delete them whenever they like.

## Decisions settled in discussion (2026-10-01)

The reasoning and the alternatives rejected are in [`design-notes.md`](./design-notes.md).

1. **Identity hints only, with `was` as the one vocabulary.** The project serves the scenarios where the diff shows a drop and a create for one renamed thing: model rename, field rename, and, if they fit a slice, a model moving between namespaces, an enum value rename and an explicitly named index or constraint rename. Value hints that supply an expression (a cast for a type change, a backfill for a new required column) and data moves between models are future extensions of the same attribute, not this project.
2. **`was` holds the old storage name**, the value `@@map` or `@map` would have carried before the rename. A hint resolves against the origin schema alone. The planner never opens an older contract to interpret the destination contract.
3. **A spent hint is silently ignored.** When the origin already has the new name and not the old one, the hint does nothing. A hint whose old name and new name are both absent also does nothing. An origin that has both names refuses the plan. `migration plan` reports the hints it consumed.
4. **One attribute, named arguments.** `@@hint(...)` on models and `@hint(...)` on fields, with `was` as the first argument. Later hint kinds join as further named arguments on the same attribute.
5. **Surfaces and targets.** PSL and TypeScript authoring. Postgres and SQLite. MongoDB is a planned follow-on project reusing the contract vocabulary. The Prisma 6 and Prisma 7 schema sources do not accept the attribute.
6. **Hints travel in the emitted `contract.json`** outside every hashed section, so the planner needs nothing beyond `contract.json` and the origin schema, and `migration plan` stays offline.

## Non-goals

- No inference of renames from matching columns or any other heuristic. A rename happens only when a hint names it.
- No value hints and no data moves between models in this project. The attribute is designed so they can join later.
- No MongoDB operations. The contract shape is family-neutral; the Mongo planner and operations are a separate project.
- No hint acceptance in the Prisma 6 or Prisma 7 schema sources.
- No change to `db verify`. It reports the drift that exists until an environment is updated.
- No record of hints in the migration manifest. ADR 199 removed that field; the migration's `ops.json` and `migration.ts` record the rename operations and nothing else is needed.

## Place in the larger world

- **Planner inputs.** Every planner takes a destination contract and an origin schema: a derived schema from a contract snapshot for `migration plan`, an introspected database for `db update` and `db init`. The SQL planners are `packages/3-targets/3-targets/postgres/src/core/migrations/planner.ts` and its SQLite sibling; both run one differ over two schema IRs ([ADR 235](../../docs/architecture%20docs/adrs/ADR%20235%20-%20The%20schema%20differ%20walks%20two%20derived%20schema%20IRs.md)). Hints become the third input.
- **Rename substrate.** prisma/orm#30331 adds `renameTable` on Postgres and SQLite and the family-level `applyTableRename` in `packages/2-sql/9-family/src/core/migrations/apply-table-rename.ts`. That function takes a start contract, an end contract and a `{from, to}` pair, rewrites the start contract with the table under its new name, and resolves the companion renames for constraints, indexes and row-level security. A model hint is a second source of that pair; the planner with a hint produces the same migration file a user hand-writes today.
- **Attributes.** PSL attributes are declared through specs ([ADR 231](../../docs/architecture%20docs/adrs/ADR%20231%20-%20Declarative%20attribute%20specifications.md)); the SQL family's built-ins live in `packages/2-sql/2-authoring/contract-psl/src/sql-attribute-specs.ts` next to `map`. The central spec registry ([ADR 249](../../docs/architecture%20docs/adrs/ADR%20249%20-%20Central%20attribute-spec%20registry.md)) feeds the language server, so a registered `hint` spec gets completion and diagnostics for free.
- **Contract hashing.** The storage hash covers target, family and the `storage` section only (`packages/1-framework/0-foundation/contract/src/hashing.ts`). `contract.json` already carries unhashed top-level sections.
- **Snapshots.** `migration plan` writes the destination contract into the content-addressed snapshot store (`packages/1-framework/3-tooling/migration/src/contract-snapshot-store.ts`) and copies it into the migration directory as `end-contract.json` ([ADR 232](../../docs/architecture%20docs/adrs/ADR%20232%20-%20A%20migration%20is%20authored%20against%20its%20start%20and%20end%20contract%20snapshots.md)).
- **Naming.** Default constraint and index names derive from table and column names ([ADR 009](../../docs/architecture%20docs/adrs/ADR%20009%20-%20Deterministic%20Naming%20Scheme.md)), and a secondary index's physical name carries a hash of its content, which includes its column names ([ADR 243](../../docs/architecture%20docs/adrs/ADR%20243%20-%20Name-identified%20indexes%20and%20exact-name%20adoption.md)). A column rename therefore changes the names of the objects built on the column, not just the column.
- **The verbatim guard.** `MIGRATION.TABLE_NAME_CASE_CHANGED` refuses the drop-and-create pair that the verbatim table name change produces and lists the ways out ([psl-verbatim-table-names](../psl-verbatim-table-names/spec.md)).
- **Documentation already promising this.** The Data Contract and Migration System subsystem docs and ADR 001 describe `@hint(was: "old_name")` as the planner's source of rename intent. The sentence saying hints are recorded in migration edges is stale since ADR 199 and is corrected at close-out.

## Cross-cutting requirements

1. **A hint is never a guess.** The planner acts on a hint only when the origin has the old name and lacks the new one. Both present refuses with a structured error naming both. Neither present, or only the new, is a no-op with no diagnostic from `db update` or `db init`.
2. **Self-contained contract.** Resolving a hint reads the destination contract and the origin schema. No command reads an older contract, a migration directory or the source file to interpret a hint.
3. **The contract shape is family-neutral.** A hint is recorded on the entity it annotates using the entity's storage coordinate, in a dedicated unhashed section of `contract.json`, validated like every other section. It is stripped when a contract is written to the snapshot store and to a migration directory, so no snapshot carries a stale hint and the storage hash of a contract with and without hints is identical.
4. **Companion objects follow the rename, never a rebuild.** Every constraint, index and policy whose name derives from a renamed table or column is renamed, not dropped and recreated, on both targets. The rules prisma/orm#30331 established for the table case apply to the column case: an object the destination contract also changes keeps the name the database has; an explicitly named object keeps its name.
5. **Hints compose.** A model hint and field hints on the same model in one change resolve in order: the model rename first, then each field rename under the new table name.
6. **Same output as the hand-written route.** With a model hint, `migration plan` writes a `migration.ts` that calls `this.renameTable(...)` and an `ops.json` identical to the hand-written migration for the same change. The hand-written route stays as the fallback, and the verbatim guard's remedy list names the hint first.
7. **Both authoring surfaces are equal.** The TypeScript DSL exposes the same hints on the model and field builders, lowering to the same contract section.
8. **One new column rename operation per target**, with prechecks and postchecks in the style of `renameTable`, exported through the target's migration facade so a hand-written migration can call it too.

## Transitional-shape constraints

- The project builds on prisma/orm#30331 and its first slice lands after that PR merges.
- The contract section, the attribute and the model rename land together in the first slice. A contract section with no consumer, or an attribute with no effect, is not shipped on its own.
- Each slice that adds a hint-able entity kind adds the planner behaviour for both targets in the same PR. No target gains a hint the other lacks.

## Contract-impact

A new unhashed `hints` section on `contract.json`, holding one entry per annotated entity keyed by storage coordinate, each entry carrying `was`. Validation is additive: a contract without the section is unchanged. The exact key layout is settled in slice 1's spec.

## Adapter-impact

- **Postgres:** planner consumes model and field hints; new column rename operation; companion renames for column-derived names.
- **SQLite:** the same; a column rename that only changes ASCII case goes through a temporary name, as the table case does.
- **MongoDB:** none in this project.

## ADR pointer

One ADR at close-out: planner hints in the contract source, covering the attribute, the unhashed contract section, resolution against the origin schema, spent-hint semantics and the extension path for value hints. ADR 001, ADR 028 and the two subsystem docs are amended to drop the stale "recorded in migration edges" text.

## Project DoD

In addition to the team DoD floor in [`drive/calibration/dod.md`](../../drive/calibration/dod.md):

- A journey on Postgres and on SQLite renames a model and a field in one change with hints, runs `migration plan` then `migrate` on a table with rows, a unique constraint, a foreign key, a secondary index and a check, and afterwards the rows and objects are present under the new names, a plan with no schema change is empty, and `db verify --schema-only` is clean.
- The same schema change through `db update` on both targets produces the same database state.
- Running `db update` a second time with the hints still present plans nothing.
- A contract emitted with hints has the same storage hash as the same contract with the hints removed, and no migration directory or snapshot contains a `hints` section.
- The verbatim guard's error names the hint as its first remedy, and the upgrade fragment for the verbatim change describes the hint route.
- The project's ADR and doc amendments are merged.

## Open questions

None outstanding at shaping. Slice-level questions, such as the exact contract key layout and whether enum value renames fit, are settled in the slice specs.

## References

- [prisma/orm#30331](https://github.com/prisma/orm/pull/30331) — rename-table operation and `applyTableRename`.
- [`projects/psl-verbatim-table-names/`](../psl-verbatim-table-names/spec.md) — the project that made this one necessary.
- Data Contract subsystem doc § "Canonical contract vs planner hints"; Migration System subsystem doc § "Planner".
- [ADR 199](../../docs/architecture%20docs/adrs/ADR%20199%20-%20Storage-only%20migration%20identity.md) — removed `hints` from the migration manifest.
