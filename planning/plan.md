# Plan: Prisma 8 GA

Private planning notes. Local branch only. Do not push.

This file records what Will decided in the planning discussion of 2026-09-28. The inventory behind it is in [open-projects.md](open-projects.md) and [eval-friction-2026-09-28.md](eval-friction-2026-09-28.md).

## Goal

Ship Prisma 8 GA at the end of October 2026. November is the fallback.

## Team

Will Madden and Serhii. Agents write all the code. Will takes the contract, migrations, targets and the upgrade path. Serhii takes language tools and the query side.

## Who it is for

The target user is new to Prisma, in a new project, building with AI.

Existing Prisma 7 users must be able to upgrade. They reacted badly to the release candidate because the upgrade path was missing. Prisma 8 does not copy the Prisma 7 query API. Users run the Prisma 7 client beside the Prisma 8 client.

## Rules for ordering work

1. Breaking changes come as early as possible. GA is the last chance to make them.
2. Changes that database targets build on come before new targets.
3. Additive features can follow GA.

## Tests for GA

1. **Upgrade:** Prisma 8 can describe every database feature Prisma 7 could describe, so an existing database can be signed. Which gaps to leave is Will's judgment.
2. **New user:** the getting-started eval passes. Starting a project takes few steps and needs no workarounds. The eval needs an ORM scenario without a deploy, run against every database. The project it builds is not decided.

## Databases

All four at GA: PostgreSQL, SQLite, MySQL/MariaDB, MongoDB. No MySQL target exists in the repo today.

Fallback if time runs out: PostgreSQL is GA, the others are labelled release candidate or early access.

## Required before GA, in order

| Order | Work | State on 2026-09-28 |
| --- | --- | --- |
| 1 | Finish ADR 254, Linear project "Data types own column types" | Design in progress on branch `data-types-completion`. 3 of 16 questions settled. No spec yet. 4 of 9 parts of the ADR are built. |
| 2 | One CLI and one config file | See below. |
| 3 | Early MySQL attempt | Not started. Purpose: find shared code that assumes PostgreSQL. |
| 4 | SQL expression literals | 6 tickets in backlog. Blocked, see below. |
| In parallel | Upgrade path: Prisma 7 schema gaps, baseline command, upgrade guide rewrite | Will is working on it now. |
| In parallel | Docs items from the eval | 11 items, 5 high. Owned by the team. |
| In parallel | Multi-file PSL | 2 of 3 parts merged. Language server part open in prisma/orm#30456. |
| In parallel, Serhii | VS Code extension | Critical. Serhii is working on it. No Linear project found. Must have at GA: the formatter works without the `prisma` CLI installed, go-to-definition into PSL, multi-file PSL support, integration with the `prisma` emulator controls. |
| Not ordered yet | Emulator controls in the `prisma` CLI | Not tracked. The VS Code extension depends on it. The eval found that stopping `prisma dev` leaves the emulator processes running and that no stop or cleanup command exists. |
| Not ordered yet | "Contract print and Prisma 7 source follow-ups" | Linear project created 2026-09-28. 18 issues, all backlog, 3 high (TML-3322, 3323, 3326). |

## One CLI and one config file

This is part of the strategy, not a single ticket.

- `prisma` is the only CLI anyone is told to use.
- `prisma.config.ts` is the only config file. Composer's configuration moves out of `prisma-composer.config.ts`. Today the `composer` section holds only a path to that file.
- The standalone `prisma-composer` CLI is removed.

Tracked so far: TML-3340 (docs and the shipped skill name `prisma-composer`). Not yet tracked: the config merge, removing the standalone CLI, adding `destroy` to `prisma`.

## Blockers

| Blocker | What it blocks | State |
| --- | --- | --- |
| Pull request prisma/orm#30381, "Generic block values bind the shared typed expression grammar" | The whole "SQL expression literals" project, starting with TML-3296 and TML-3288. Also question 9 of the data types design. | Open since 2026-09-22. Review required. Merge conflicts with `main`. Serhii hopes to merge it on 2026-09-28. |
| ADR 254 remaining work | MySQL/MariaDB and any other new target | See order 1. |
| Platform faults (crash loops, 502 responses, Management API errors) | The eval passing on the deploy scenario | Will handles these as platform lead. They are not ORM priorities unless they delay GA. |

## After GA

- `@hint(was: oldName)`. High user value, additive.
- PSL mixins (TML-3055). Additive. `@db.*` attributes are already removed. Field presets and `types {}` aliases still exist in the code. Open: what happens to those two.
- Query linting.
- Querying across contract spaces. Optional, but a competitive advantage.
- Performance work.
- The BetterAuth flow.

## Lower priority, handled by Will in parallel

- Asks.
- The getting-started eval harness.

## Not placed yet

- Migration runner service.
- Manifesto.
- Package consolidation (stop publishing about 60 internal packages).

## Open questions

1. Field presets and `types {}` aliases: remove before GA without mixins, or keep through 8.x?
2. What must the emulator controls in the CLI do, and who builds them?
3. Which of the 18 follow-up issues are required for GA?
4. What is the stopping point for the Prisma 7 schema gaps?
5. Two documents claim the number ADR 256: the one planned in TML-3288 and the one proposed in prisma/orm#30428.
