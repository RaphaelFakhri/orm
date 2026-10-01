# Design notes — Rename hints in the contract source

Record of the design discussion on 2026-10-01 between the operator and the orchestrator. Each decision carries its reasoning, the assumptions it rests on, and the alternatives rejected.

## Principles

- The planner never guesses. It acts on a rename only when the user has stated it, and refuses when the statement is ambiguous against the database it sees.
- The contract is self-contained. Interpreting it needs no other contract, no migration directory and no source file.
- The hint is sugar over the hand-written route. Whatever a hint produces, a user could have written by hand, and the hand-written route stays available.

## Scenarios considered

The diff is ambiguous in these situations. Groups by what the user has to say:

| Scenario | What the diff shows | Group |
| --- | --- | --- |
| Model renamed | drop table, create table | identity |
| Field renamed | drop column, add column | identity |
| Model moved to another namespace | drop in one, create in another | identity |
| Enum value renamed | value removed, value added | identity |
| Explicitly named (`map:`) index or constraint renamed | drop, create | identity |
| Field type changed | type mismatch, no conversion | value |
| Required field added to a table with rows | add column, nothing for existing rows | value |
| Field moved to another model; model split or merged | several drops and creates | data migration |

**Decision:** serve the identity group. Keep the value group as a declared extension of the same attribute. Leave data moves out.

**Why:** the identity group is one concept with one vocabulary, and model plus field rename cover almost all real occurrences. Value hints each carry an expression and belong to a different planner strategy. Data moves are migrations, not hints.

## Decisions

### 1. `was` holds the old storage name

`@@hint(was: "Profile")` means the table used to be called `Profile`, exactly what `@@map("Profile")` would have said. The planner looks that name up in the origin schema.

**Why:** `db update` and `db init` have no origin contract, only an introspected database. A hint phrased in domain terms (the old model name) could only be resolved by opening the previous contract, which `db update` does not have and which would break the self-contained contract. With verbatim table names now the default, the old model name and the old table name coincide unless `@@map` was in play.

**Assumes:** users renaming a model that carried `@@map` understand they write the mapped name. The error for an unmatched hint can point this out.

**Rejected:** the domain reading, where `was` names the old model and the planner resolves it through the origin contract. Rejected by the operator because the contract must be self-contained.

### 2. A spent hint is silently ignored

When the origin already has the new name and lacks the old one, the hint does nothing and emits no diagnostic. `migration plan` reports the hints it consumed.

**Why:** the two workflows consume a hint at different times. With migration history, the hint is consumed once, when the migration is planned; from then on the migration file carries the rename and every environment replays it. Without history, each environment plans live against its own database, so the hint must stay until the last environment is updated, and nobody can tell the user when that is. Deleting it early silently turns the next environment's update into a drop and a create, the data-loss case the mechanism exists to prevent. So the safe default is that leaving a hint in place forever costs nothing. A warning on every `db update` after the first would train users to delete hints early.

**Rejected:** warning on a hint that matches nothing. Rejected because `db update` users would see it forever.

### 3. An origin with both names refuses

If the origin has `Profile` and `User`, the hint on `User` saying it was `Profile` is a contradiction, and the plan fails with a structured error naming both.

**Why:** acting on it would either drop a table the contract no longer declares while claiming a rename, or rename over an existing table. Neither is a guess the planner may make.

### 4. Hints travel in `contract.json`, outside the hashed sections

**Why:** `migration plan` is offline and reads `contract.json` (ADR 097: tooling runs on canonical JSON only). The TypeScript authoring path builds the contract in process and has no PSL file to re-read. A sibling file would be a second artifact every emitter and every copy step must carry. An unhashed section keeps one artifact and leaves every hash unchanged. The subsystem docs say hints "are not part of the canonical contract"; the precise reading is that they do not participate in hashing, which this honours.

**Assumes:** the snapshot store and the migration directory strip the section, so a stale hint never lives in a snapshot.

**Rejected:** a sibling `contract.hints.json`; re-reading the source at plan time (breaks ADR 097 and does not exist for TS authoring); recording hints in the migration manifest (ADR 199 removed the field, and `ops.json` already records what the hint produced).

### 5. One attribute with named arguments

`@@hint(was: ...)` and `@hint(was: ...)`. Future kinds join as further arguments, for example `@hint(cast: "...")` or `@hint(backfill: "...")`.

**Why:** the user learns one word, and the attribute spec grows by one named argument per kind without new grammar. `was` must be a string, not an identifier: the old name is no longer a symbol in the schema.

**Rejected:** one attribute per hint kind (`@@was`, `@cast`). More grammar for the same information.

### 6. Surfaces and targets

PSL and TypeScript authoring. Postgres and SQLite. Mongo later. Prisma 6 and 7 sources excluded.

**Why:** Mongo doubles the operation work, and a Mongo field rename is a rewrite of every document, a different kind of change from DDL; it deserves its own project on the same contract vocabulary. The Prisma 6 and 7 sources read older schemas unmodified; a user who is renaming is already editing the schema and can move it to Prisma 8 syntax first.

### 7. `db verify` ignores hints

**Why:** until an environment is updated, the drift it reports is real. Teaching verify to read hints would make it report a pending rename as clean.

### 8. Builds on the rename-table PR

The model rename reuses `applyTableRename` and the companion-rename rules from prisma/orm#30331. The planner with a hint produces the same `migration.ts` a user would hand-write.

**Why:** the PR already solved the hard part of a table rename, the companion renames and the refusal cases. The hint is a second source of the `{from, to}` pair.

## Routine calls made by the orchestrator

- Hints compose: model rename first, then field renames under the new table name.
- The verbatim guard's remedy list names the hint first; the hand-written migration and the by-hand statements stay as fallbacks.
- The column rename operation is exported through each target's migration facade, so it serves hand-written migrations too.
- Slice order: attribute plus contract section plus model rename; then field rename; then the remaining identity kinds if they fit, otherwise deferred.

## Open questions

None at shaping. Settled in slice specs: the exact contract key layout; whether enum value renames can be expressed on native enums given the planner's current refusal to modify enum values; whether the language server needs anything beyond the registered spec.

## References

- [`spec.md`](./spec.md)
- [prisma/orm#30331](https://github.com/prisma/orm/pull/30331)
- Data Contract subsystem doc § "Canonical contract vs planner hints"
- [ADR 199 — Storage-only migration identity](../../docs/architecture%20docs/adrs/ADR%20199%20-%20Storage-only%20migration%20identity.md)
