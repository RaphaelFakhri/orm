# Context behind the plan

Planning notes on the branch `planning/prisma-8-ga`. Not for merging into `main`.

This file holds the findings and reasoning from the planning discussion of 2026-09-28 and 2026-09-29 that are not in [plan.md](plan.md) or [decisions.md](decisions.md). Each finding says how it was checked. "Read" means an agent read the code or document. "Not verified" means nobody checked.

## What "GA" meant before, and what changed

- The first definition is in `projects/prisma-8-rc1/` (July 2026): `release-definition.md`, `scoreboard.md`, `plan.md`. It made PostgreSQL the only GA database, promised no Prisma 7 feature parity, and said GA ships when a feature-support matrix is fully proven, the migration test passes, and a quiet period passes.
- The feature-support matrix was never built. No such file is in the repo (read). The nearest things are the ported Prisma 7 tests and the section "What Prisma 8 doesn't do yet" in `skills/prisma-8/references/queries.md`.
- The July plan froze PSL syntax, the CLI and error codes at the release candidate. `docs/oss/versioning.md` replaced that: release candidates may include breaking changes until 8.0.0 final (read).
- The July plan promised that `npm install prisma` would keep installing Prisma 7 until GA. It installs Prisma 8 today (read in the public docs).
- A planning note from the ORM Slack channel listed: onboarding and migration improvements, all first-class databases, multi-file PSL, querying across contract spaces, performance. Will confirmed all four databases. He made performance and cross-space querying optional. The BetterAuth flow is not tied to multi-file PSL and is not required.

## What upgrading from Prisma 7 means

- Prisma 8 must describe the same database features as Prisma 7, so an existing database can be signed. It does not copy the query API.
- Users run the Prisma 7 client beside the Prisma 8 client: old queries stay on Prisma 7, new queries use Prisma 8.
- The Prisma 7 work is at the top because users of earlier versions reacted badly to the release candidate. The features they need are needed for GA anyway.
- The manual cutover today is three commands: `prisma migration plan --name baseline`, `prisma db sign`, `prisma migration ref set db <timestamp>_baseline` (read in `projects/prisma7-contract-source/slices/04-prisma7-adoption-example/spec.md`). The baseline command replaces them.
- With opaque columns ruled out, the set of codecs decides who can upgrade. Users may need to write their own codec, so the error for a missing codec should point to `docs/reference/codec-authoring-guide.md`.

## One CLI and one config file: what was found

- `prisma-composer` was the first, standalone CLI for Composer. The consolidated `prisma` CLI made it redundant. It was kept because it exposes the whole Composer API and `prisma` does not. Nobody should be told to use it.
- In `prisma/composer` at commit `c29ae43`, the command is named 55 times across seven files, including the skill that `prisma init` copies into every project (read).
- `prisma` has `deploy` and `dev` but no `destroy` (from the eval report, not verified in code). Whether it has an equivalent of `prisma-composer log` is not verified.
- The config is still split. The `composer` section of `prisma.config.ts` has one field, `configPath`, which points to `prisma-composer.config.ts` (read, `packages/0-framework/3-tooling/cli/src/family/section.ts` in `prisma/composer`).
- The code comment gives this reason: Composer's config holds executable values, and the section validator must be light. That reason does not hold. The ORM section already holds built descriptors, and its validator only checks identifying fields (read, `packages/1-framework/3-tooling/config-loader/src/orm-section.ts`).
- The one real difference: Composer's config imports Alchemy, which needs an exact version of `effect`. A wrong version crashes at import. In a shared file that would break every command. Will's decision: consolidate regardless.
- The CLI consolidation plan in this repo (`projects/consolidate-clis/`) already said the Composer config becomes a section. The implementation stopped at the pointer.

## ADR 254: what is built and what is left

- Built (4 parts): data types with casts, a codec names its data type, PSL entries that read and write values, strict assembly across packs. Merged in prisma/orm#30350.
- Left (5 parts): a data type's DDL name and aliases, its parameters and their rendering, deriving `nativeType` instead of storing it, type constructors naming a data type and a codec, function parameters typed by a data type.
- `nativeType` is still stored in `contract.json`, and 117 source files outside tests refer to it (read).
- The design is on the local branch `data-types-completion`, in `projects/data-types-completion/` (`research.md`, `design-notes.md`). Settled by Will on 2026-09-27: the contract stops storing `nativeType`, databases are re-signed with `db sign`, and a contract in the old format is refused.
- Question 9 of that design (the `dataTypeValue` building block for function arguments) waits on prisma/orm#30381.
- This is what new database targets build on. It is why it comes before MySQL.

## SQL expression literals: what is built and what is left

- Built: column defaults are written as `` sql`...` `` (prisma/orm#30325), and `dbgenerated` is removed (prisma/orm#30380).
- Left: index predicates, index expressions, CHECK constraints and RLS policies still take plain strings (read, the Supabase contract).
- Raw SQL is a value of the data type `sql/expression`. TML-3296 stays open. ADR 254 currently registers `sql` as a special "lowering entry"; TML-3296 replaces that on purpose. The design is on the branch `tml-3282-sql-expression-literals`.
- Will's requirements: every SQL expression passed to the database goes through the data type system and the codec, because that is what handles casts and lowering. Generated `migration.ts` files print SQL expressions in the `` sql`...` `` form. The operations in `migration.ts` that take SQL expressions are part of this work.
- Will sees the index, CHECK and RLS part as the part with real value, and removing `pg.sql` and `sqlite.sql` as cleanup.

## The MySQL attempt

- Will expects new targets to be easy once PostgreSQL is nearly finished, because they repeat existing patterns or reuse code moved to a shared place.
- "PostgreSQL nearly finished" means no more breaking changes to what targets build on.
- Differences that may break shared code: no transactional DDL, no `RETURNING`, no schemas separate from databases, different identifier quoting and length limits.
- No MySQL code exists in the repo apart from one test fixture config (read).

## PSL mixins

- TML-3055 records a team decision of 2026-07-20. Mixins are not parameterized. Relations in mixins are out of scope for the first version. The ticket lists the design points to settle.
- The mixins design depends on ADR 254, because the ticket says type constructors carry storage.
- The data types design (question 13) keeps type aliases and field presets working until mixins replace them.

## The getting-started eval

- It lives in `prisma/getting-started-eval`. Each nightly run has a `report` artifact.
- The run of 2026-09-28: all three agent attempts passed, the automated script failed at `npx prisma dev module.ts`, and the report listed 54 friction items (36 distinct).
- It tests Composer, the platform and the CLI. Only 3 of 36 items concern the ORM. A MongoDB quickstart test was added on 2026-09-28.
- The four worst items are platform faults, which the ORM team cannot fix in the ORM.
- Will's bar for the new user: no friction points, and the judged criteria pass. None passes well today.

## Query features: findings

- The ORM's filter operators are `eq`, `neq`, `in`, `notIn`, `gt`, `lt`, `gte`, `lte`, `like`, `isNull`, `isNotNull`, plus `ilike` and full-text search from the PostgreSQL target (read).
- `contains`, `startsWith` and `endsWith` would be small additions over `like`. JSON filters need operators in the target first, because none exists (read).
- Comparing two columns works when both use the same codec (read, not run).
- Nested writes: `relation-mutator.ts` has `create`, `connect` and `disconnect` only (read). TML-2781 describes the rest and calls it large enough for its own project. The many-to-many variants depend on walking the join table (TML-2597).
- The ported Prisma 7 tests cover 1926 of 4097 query-side tests. Writes are almost unexamined. Their records list 54 failing tests, and the test files mark 72.
- Serhii already has ideas for `firstOrThrow`.

## What limits the team

Agents write all the code. The limit is the attention of two people: deciding, writing or approving specs, and reviewing.

Rule for choosing the next piece of work. Stop at the first yes:

1. Is someone waiting on me for a review, a merge or a design answer?
2. Is something wrong in front of users today?
3. What is the earliest breaking item on the critical path that is not blocked?
4. Does a critical-path item still lack a spec?
5. Only then, additive work that moves one of the two GA tests.

## Changes made outside this branch during the discussion

| Where | Change |
| --- | --- |
| Linear | Filed TML-3340 (urgent): docs and skill name `prisma-composer` |
| Linear | Set to Done, with pull request links: TML-3252, 3298, 3291, 3170, 3125, 3010, 3012, 3154, 3155, 3238, 3239, 3240 |
| Linear | Set to In Review: TML-3260 (prisma/orm#30438), TML-3278 (prisma/orm#30451) |
| Linear | Moved back to To-do, for lack of evidence: TML-3253, 3213, 3186, 3156, 3030, 3026, 3085, 3035, 2960, 2840, 2815, 2736, 2826, 2521, 2495, PRS-311, PRS-350, PRS-352 |
| Linear | Canceled TML-3271 (opaque column type), with a comment giving the reason |
| Linear | TML-3288 marked as blocked by TML-3296. Comments on the projects "SQL expression literals" and "Data types own column types" record what prisma/orm#30381 blocks. |
| prisma/orm#30449 | One commit: the opaque codec is removed from the deferred list in `projects/prisma7-contract-source/spec.md` |

## Known weak points in these notes

- [open-projects.md](open-projects.md) is the first inventory. Parts of it are out of date, such as its list of stale issues and its statement that ADR 254 is not started.
- [query-feature-gaps.md](query-feature-gaps.md) was gathered by two agents. Four of its source records were wrong. Check the code before acting on a line.
- States in [plan.md](plan.md) are as of 2026-09-29. Whether prisma/orm#30381 has merged is not rechecked.

## Columns Prisma 8 does not manage (added 2026-09-30)

Proposed by Will and Serhii: Prisma 7 contracts need a way to state `Unsupported(...)` columns, and legacy columns need a way to be managed outside Prisma 8, through control policy. Syntax ideas they considered:

```prisma
model User {
  name      String
  legacy_id unknown @control(external)
}
```

```prisma
model User {
  name String
  sql {
    legacy_id unknown @control(external)
  }
}
```

```prisma
model User {
  name String
}

table User {
  legacy_id unknown @control(external)
}
```

Facts read on `main`:

- The contract IR already stores a control policy on each column (`storage-column.ts`) and each table.
- PSL has only a model-level `@@control`. There is no field-level `@control`.
- A model whose control policy is not `managed` gets no derived CHECK constraints (`psl-field-resolution.ts`). This bears on the enum membership check during adoption.
- The TypeScript contract builder describes table details in a `.sql({ ... })` section on the model, apart from the fields. A `sql { }` block in a PSL model would mirror it.
