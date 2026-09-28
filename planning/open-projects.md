# Open projects: Prisma ORM, Composer, Prisma CLI

Private planning notes. This file lives only on the local branch `worktree/prisma-orm-planning-51fed0`. Do not push it.

Snapshot taken 2026-09-28 from Will's notes, Linear, and the open pull requests of the `wmadden-electric` bot.

## 1. Priorities from Will's notes, with current state

### 1.1 Set up Prisma 8 with a Prisma 7 contract source

- Linear project: [Prisma 7 contract source: gaps and defects](https://linear.app/prisma-company/project/prisma-7-contract-source-gaps-and-defects-b1952f4c6133), In Progress. In-repo project folder: `projects/prisma7-contract-source`.
- 31 issues: 8 done, 1 duplicate, 4 in progress, 7 to-do, 11 backlog.
- In progress:
  - TML-3278 (urgent): the PSL source drops `type.typeParams` on scalar list columns. No open PR found.
  - TML-3252 (high): brace-form array defaults. PR [prisma/orm#30436](https://github.com/prisma/orm/pull/30436).
  - TML-3260 (high): `db sign` suggests the wrong next action. PR [prisma/orm#30438](https://github.com/prisma/orm/pull/30438).
  - TML-3253 (medium): `interval`, `timetz`, `bytea`, `jsonb` defaults. No open PR found.
- To-do, not started: TML-3250 (urgent, `db init` fails without global `Temporal`), TML-3255, TML-3280, and four low-priority CLI and docs defects (TML-3258, 3259, 3261, 3262).
- Backlog, the "common Prisma 7 features" list: TML-3267 and TML-3268 (both high, `@updatedAt` with `@default(now())` and generated values on optional fields), views (3269), more Postgres codecs (3270), `Unsupported` columns (3271), cross-namespace enums (3272, 3273), index options (3274), and three low-priority items (3275, 3276, 3277).
- Other open PRs in this area:
  - [prisma/orm#30449](https://github.com/prisma/orm/pull/30449): deferred lists of the project match the code.
  - [prisma/orm#30095](https://github.com/prisma/orm/pull/30095): recover domain enums from check constraints. Open since 2026-08-21.

### 1.2 Use Prisma 8 for migrations in an existing Prisma 7 project, queries unchanged

- Baseline command: no ticket or project found. Related: TML-3101 (`db verify` cannot reach a clean baseline against a Prisma Migrate database), still in Triage since July.
- Upgrade guide: TML-3291 is in progress (stop recommending `"module": "nodenext"`). No ticket found for writing or consolidating the guide itself.
- The Prisma 7 `orm init` work merged (prisma/orm#30291). Its release is still pending.

### 1.3 Docs

- Restructure: draft PR [prisma/web#8243](https://github.com/prisma/web/pull/8243) holds the audit, personas, journeys and proposed structure. Opened 2026-09-11, last updated 2026-09-23. No Linear ticket checked.
- Getting-started eval nightly: lives in `prisma/getting-started-eval`. The Slack webhook URL is still open.

### 1.4 Manifesto

- PR [prisma/prisma-orm-messaging#17](https://github.com/prisma/prisma-orm-messaging/pull/17): spec, drafts and research. Open since 2026-09-23.
- Two older PRs sit in the same repo: #16 (writer's brief, August) and #15 (agent-safety article, July).

### 1.5 VS Code extension

- No current ticket, project or PR found. Linear only has old items, for example TML-732 (move the language server into `prisma/prisma`, 2025).
- This priority has no tracked work yet.

### 1.6 Asks

- Linear project: [Asks MVP](https://linear.app/prisma-company/project/asks-mvp-e95e57031ee9), In Progress. Its three tickets (TML-3238, 3239, 3240, slices 1 to 3) were last updated 2026-09-10.
- The repo is far ahead of Linear. Open PRs: [prisma/asks#38](https://github.com/prisma/asks/pull/38) (slice 24, re-judging pull requests), [#39](https://github.com/prisma/asks/pull/39) (list sorting), [#40](https://github.com/prisma/asks/pull/40) (change own password).
- Not confirmed from these sources: whether automatic PR and issue validation, and Discord monitoring with prepared responses, already work.

### 1.7 SQL expression literals

- Linear project: [SQL expression literals](https://linear.app/prisma-company/project/sql-expression-literals-c8a6659e7f4c), In Progress. The plan ticket (TML-3282) is done. Six implementation tickets are in backlog: TML-3296, 3288, 3289, 3287, 3290, 3297.
- It was on hold for two PRs. prisma/orm#30349 has merged. prisma/orm#30381 is still open.

### 1.8 Hints: `@hint(was: oldName)`

- No ticket for the feature. Related: TML-2534 (a journey test risks inventing `@hint` syntax) and TML-2273 (delete `MigrationManifest.hints`), both backlog.
- Related open PR: [prisma/orm#30331](https://github.com/prisma/orm/pull/30331), rename a table without losing rows in a hand-written migration. Open since 2026-09-17.

### 1.9 Migration runner service

- The proof of concept project is complete (four tickets done 2026-07-31, in the Composer repo). No follow-up project found.

### 1.10 Query linting

- Only an old project exists: "[PN] Runtime Linting" with TML-1722 (backlog, 2025). Related: TML-3200 (annotations on raw statement builders).

### 1.11 PSL mixins (TML-3055)

- Backlog, no project, not touched since 2026-07-20. The ticket says it needs its own spec and plan before work starts.

## 2. Open work that is not in Will's notes

### 2.1 Open bot PRs

| PR | Title | Opened |
| --- | --- | --- |
| [prisma/orm#30444](https://github.com/prisma/orm/pull/30444) | Calibration: reviewers of SQL lowering run probes | 2026-09-28 |
| [prisma/orm#30439](https://github.com/prisma/orm/pull/30439) | Mongo: `Json` means JSON, new `Bson` scalar | 2026-09-27 |
| [prisma/orm#30428](https://github.com/prisma/orm/pull/30428) (draft) | Design: collection scopes derived from indexes (ADR 256) | 2026-09-27 |
| [prisma/orm#30411](https://github.com/prisma/orm/pull/30411) | PR template asks for an example and a conventional title | 2026-09-25 |
| [prisma/prisma-cli#313](https://github.com/prisma/prisma-cli/pull/313) | Substitute `{bin}` in next actions and diagnostics | 2026-09-27 |
| [prisma/prisma-cli#312](https://github.com/prisma/prisma-cli/pull/312) | Close the prisma-cli-v8 project | 2026-09-27 |
| [prisma/prisma-cli#273](https://github.com/prisma/prisma-cli/pull/273) | Replace em dashes in the error reference | 2026-09-17 |
| [prisma/prisma-cli#208](https://github.com/prisma/prisma-cli/pull/208) | Rollback and service logs happy paths | 2026-08-18 |
| [prisma/prisma-cli#198](https://github.com/prisma/prisma-cli/pull/198) | Make `Runtime.outputStreamsShareDevice` required | 2026-08-18 |
| [prisma/prisma-cli#197](https://github.com/prisma/prisma-cli/pull/197) | Call every presentation | 2026-08-18 |
| [prisma/pdp-control-plane#4902](https://github.com/prisma/pdp-control-plane/pull/4902) | ADR 012: resources live on branches | 2026-08-13 |
| [prisma/open-chat#1](https://github.com/prisma/open-chat/pull/1) | Run open-chat as a native Composer app | 2026-07-17 |
| [prisma/ignite#120](https://github.com/prisma/ignite/pull/120) | Drive: prevent agents skipping trace emission | 2026-06-04 |

### 2.2 Linear projects Will leads that are not finished

- ORM: Data types own column types (Planned, finishes ADR 254), Contract-free migration planning (Planned, TML-3026 and TML-3030 in progress since July), Prisma 8 RC1 (In Progress, target date 2026-07-31), Prisma Next launch readiness (Planned, target date 2026-08-17), [PN] Gotchas (In Progress).
- ORM backlog: Dependency-aware planner ordering, Generic schema differ relational port, Source-driven migration regeneration, Consolidate the migration graph model.
- Composer: Prisma Composer (In Progress), Forcing-function apps (Planned), and backlog projects: Alchemy Prisma provider adoption (two tickets In Review since August), One-click GitHub deploys, State under branch, Framework configuration document, Auth module, Compute CI builds.
- Drive: Judge and live-experiment harness (backlog).

### 2.3 Issues marked In Progress or In Review that look stale

- Launch Overview: PRS-311 (high, Composer deploy upload fails under Bun 1.3.9 and older), PRS-350 (cli-engine publishes to the wrong dist-tag), PRS-352 (config-file resolution parity). All last updated 2026-08-27.
- ORM, last updated July or earlier: TML-3085 (high), TML-3035 (high), TML-2960, TML-3125, TML-2840, TML-2815, TML-2521, TML-1786, TML-2495.
- Recent and small: TML-3298 (four ORM defects from the rc.12 docs review), TML-3213 (typecheck flake).

## 3. Gaps between the notes and what is tracked

1. No tracked work exists for: baseline command, upgrade guide consolidation, VS Code extension, `@hint`, query linting, and the migration runner service after its proof of concept.
2. Asks tickets in Linear describe slices 1 to 3. The repo is at slice 24.
3. Two ORM projects have target dates that passed (Prisma 8 RC1, launch readiness).
4. About a dozen issues are marked In Progress with no activity since July or August.
5. Ten bot PRs are more than a month old or close to it and need a decision: merge, close, or revive.

## 4. Untracked priorities compared with the Drive project docs in `projects/`

Read 2026-09-28. The repo has 41 project folders. None is dedicated to any of the seven priorities below. The table says what the existing docs already cover.

| Priority | What the project docs say | What is still missing |
| --- | --- | --- |
| Baseline command | `prisma-8-rc1/parallel-install.md` names it as a known gap for 8.0.0 final: the command that advances the migration baseline at cutover is not implemented, and users follow a manual path. `prisma7-contract-source/slices/04-prisma7-adoption-example/spec.md` writes out that manual path: `prisma migration plan --name baseline`, `prisma db sign`, `prisma migration ref set db <timestamp>_baseline`. Both `prisma7-contract-source` specs put the cutover out of scope. | A spec and a ticket for the command. The manual three-step path is its requirements. |
| Upgrade guide | The public guides exist (PostgreSQL 7 to 8, MongoDB 6 to 8). `prisma7-contract-source/spec.md` says its source replaces phase 2 of the Postgres guide (`contract infer` plus hand edits). `prisma-8-rc1/plan.md` still has an unchecked close-out item to move the upgrade guide into `docs/`. `parallel-install.md` is marked out of date. | A task to rewrite the guide around `prisma7Schema()` and the baseline command. No project owns it. |
| VS Code extension | No project covers the extension itself. The language server is covered: `multifile-psl` (slice 2 makes it see unopened files) and `symbol-table-resolve` (moves existing features onto the binder). The server in code already offers formatting, semantic tokens, completion, signature help and diagnostics. `symbol-table-resolve/spec.md` rules go-to-definition, hover, references and rename to be follow-on work in a later project. `prisma-8-rc1/plan.md` has an open item: confirm the Prisma 7 extension and the Prisma 8 language server coexist. `prisma7-contract-source/spec.md` rules out teaching the language server to read Prisma 7 files. | A project for the extension: packaging, running without the CLI npm package, and go-to-definition. The binder it needs comes from `symbol-table-resolve`. |
| `@hint(was: oldName)` | No doc mentions `@hint`. `psl-verbatim-table-names` slice 2 adds a rename-table migration operation (PR prisma/orm#30331). Its spec says there is no automatic rename: the planner stops with an error when a plan looks like a rename. | A spec for how the contract states a rename so the planner emits the rename operation. The operation itself exists once #30331 merges. |
| Query linting | No project. `middleware-intercept-and-cache/spec.md` refers to existing `budgets` and `lints` runtime middleware, and the repo has an `eslint-plugin` package. | A decision on what "query linting" means here: runtime middleware, the ESLint plugin, or both. Then a spec. |
| Migration runner service | No mention in any project doc. The proof of concept lives in the Composer repo. | Everything. Planning it needs the Composer repo, which is outside this worktree. |
| PSL mixins (TML-3055) | `prisma-8-rc1/plan.md` lists it as "spec and slice plan immediately", the largest item before the PSL syntax freeze at RC. `feature-surface.md` item 6 records the team decision of 2026-07-20. No spec or project folder was written. | The spec and plan. Note the conflict: the plan said syntax freezes at RC, and the RC line has shipped (rc.12) without mixins. |

Three findings from this comparison:

1. Baseline command, upgrade guide and `@hint` are one piece of work. They all serve priority 1.2 (Prisma 8 migrations in an existing Prisma 7 project).
2. The VS Code priority is partly done in the language server. The untracked part is the extension and go-to-definition.
3. `projects/prisma-8-rc1` is still open and holds stale commitments (mixins, upgrade guide close-out, extension coexistence check).

## 5. Open questions for Will

1. What is the order of the eleven priorities?
2. For the Prisma 7 contract source: which backlog features must exist before the source is promoted to users?
3. Which of the old PRs and stale issues should be closed?
