# Plan: Prisma 8 GA

**Goal:** ship Prisma 8 GA at the end of October 2026. November is the fallback.

This page lists the projects in priority order, by stream. Work the streams in parallel. Inside a stream, work from the top. The reasons behind each decision are in [decisions.md](decisions.md).

"GA" column: **Must** means GA does not ship without it. **Aim** means wanted at GA, but it can ship just after. **Later** means after GA.

## Stream 1: Foundations and breaking changes

GA is the last chance to make breaking changes, so this stream decides the date.

| # | Project | GA | State | Waiting on |
| --- | --- | --- | --- | --- |
| 1 | Finish ADR 254: data types own column types | Must | Design finished 2026-09-29 (spec, design and plan on branch `data-types-completion`). Implementation under way. | |
| 2 | One CLI and one config file: merge Composer's config into `prisma.config.ts`, remove the `prisma-composer` CLI, add `destroy` to `prisma` | Must | Only the docs fix is tracked (TML-3340) | |
| 3 | Early MySQL attempt, to find shared code that assumes PostgreSQL | Must | Not started | |
| 4 | SQL expression literals | Must | Designed. Unblocked: prisma/orm#30381 merged 2026-09-29. | |
| 5 | PSL mixins, then remove type aliases and field presets (TML-3055) | Must | No spec | Spec |
| 6 | Remove `@noCheck` and `.noCheck()`, and the `noCheck` field in the contract | Must | Not started. Replacements decided, see [decisions.md](decisions.md). | prisma/orm#30051 (nullable list elements) |

## Stream 2: Upgrade path from Prisma 7

Test: an existing Prisma 7 database can be signed by Prisma 8.

| # | Project | GA | State | Waiting on |
| --- | --- | --- | --- | --- |
| 1 | Close every urgent and high upgrade issue (Linear: "Prisma 7 contract source: gaps and defects", "Contract print and Prisma 7 source follow-ups") | Must | In progress. 2 in review, about 6 open. | |
| 2 | Baseline command | Must | Not tracked | |
| 3 | Upgrade guide rewrite | Must | Not tracked | 2 |
| 4 | Codecs for `citext`, `bit`, `varbit`, `xml`, `oid` (TML-3270) | Must | Backlog | |
| 5 | Design: columns Prisma 8 does not manage, including columns of unknown type, in PSL and the Prisma 7 source (proposed: `@control(external)` on a column, and an `unknown` type) | Must | Proposed 2026-09-30. Not designed. The contract IR already has a control policy per column. PSL only has `@@control` per model. | Design |
| 6 | Adopting a Prisma 7 database without changing it: the enum membership check must not require a database change before cutover | Must | Not designed. Today a model with a non-managed control policy gets no derived checks, which may be the answer. | Design |
| 7 | Medium and low upgrade issues | Later | Backlog | |
| 8 | `money` codec | Later | Backlog | |
| 9 | Views | Later | | |

## Stream 3: Editor and tools

| # | Project | GA | State | Waiting on |
| --- | --- | --- | --- | --- |
| 1 | Multi-file PSL | Must | 2 of 3 parts merged. Last part in prisma/orm#30456. | Review |
| 2 | Emulator controls in the `prisma` CLI: start, stop, list, reset | Must | Not tracked | |
| 3 | VS Code extension: formatter without the CLI installed, go-to-definition, multi-file PSL, emulator controls | Must | In progress | 1 and 2 |
| 4 | Review how the VS Code extension handles local and remote Prisma Postgres instances, and make it match the current CLI and its emulators | Must | Not started | 2 |

## Stream 4: Query features

Everything here is additive, so nothing here can block a breaking change.

| # | Project | GA | State | Waiting on |
| --- | --- | --- | --- | --- |
| 1 | Transaction options: isolation levels, timeouts, nested transactions | Must | Not designed | Design |
| 2 | Nested writes on relations: `update`, `delete`, `upsert`, `set`, `connectOrCreate` (TML-2781) | Aim | Not started. Large. | Spec |
| 3 | Design the replacement for `omit` | Must (design only) | Not started | |
| 4 | Expressions in updates, which cover what `increment` and `decrement` did in Prisma 7 | When there is time | Not designed. `update` takes plain values only today. | |
| 5 | A query that fails when nothing matches, which covers what `firstOrThrow` did in Prisma 7 | When there is time | Exists only as `.all().firstOrThrow()`, which reads every row | |
| 6 | JSON filters and list filters | Later | prisma/orm#29834 stalled | |

## Stream 5: Docs and the new user's first hour

Test: the getting-started eval passes, in few steps and with no workarounds.

| # | Project | GA | State | Waiting on |
| --- | --- | --- | --- | --- |
| 1 | Docs and the shipped skill stop naming `prisma-composer` (TML-3340) | Must, urgent | Ticket ready to hand to an agent | |
| 2 | Correct the query reference in the shipped skill, which promises features that do not exist | Must, urgent | Not tracked | |
| 3 | Docs gaps found by the eval: 11 items, 5 high | Must | Listed in [eval-friction-2026-09-28.md](eval-friction-2026-09-28.md) | |
| 4 | ORM scenario for the eval: decide the project, then build it | Must | Not decided | Will's decision |
| 5 | Docs restructure (prisma/web#8243) | Aim | Draft | |
| 6 | Document that cursor pagination starts after the cursor row, in the upgrade guide and "Coming from Prisma ORM 7" | Aim | Not tracked | |
| 7 | Update the records that contradict the code | Aim | Listed in [query-feature-gaps.md](query-feature-gaps.md) | |

## Databases

| Database | At GA |
| --- | --- |
| PostgreSQL | Ready |
| SQLite, MongoDB, MySQL/MariaDB | Can finish after GA. Labelled release candidate or early access until ready. They start once stream 1 has stopped changing what targets build on. |

## Beside the streams

| Item | Priority |
| --- | --- |
| Manifesto (prisma/prisma-orm-messaging#17) | Publish this week |
| Asks | Lower. Will, in parallel. |
| Eval harness | Lower. Will, in parallel. |
| Platform faults found by the eval | Will, as platform lead. Not an ORM priority unless they delay GA. |

## After GA

`@hint(was: oldName)`, query linting, querying across contract spaces, performance work, migration runner service, the BetterAuth flow, referential actions on MongoDB.

## Never

`$extends`, the fluent relation API, `P2002`-style error codes, `Prisma.skip`, `omit` under that name, automatic batching, relation load strategy, `relationMode = "prisma"`, splitting large `IN` lists, soft delete, validation rules, lifecycle hooks, read replicas.
