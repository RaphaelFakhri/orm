# Handover: row locking clauses on a select

Written 2026-10-01 by agent machiavelli-37 for the next agent, who starts in a fresh session and a fresh worktree. Everything named here is pushed; nothing lives only on the old machine state except the items under "Not carried over".

## What this project is

Prisma 8 gains a typed way to lock the rows a select reads: `forUpdate()`, `forNoKeyUpdate()`, `forShare()` and `forKeyShare()` on the typed SQL builder and on the ORM client, each with `nowait` or `skipLocked` (and `of` on the builder), each present only when the adapter reports its capability flag. It started from an X thread asking how to express Postgres `FOR UPDATE` through Prisma (https://x.com/dickb0r0/status/2104858419819597998) and GitHub issue prisma/orm#30531.

Read first, in this order:

1. `projects/select-row-locking/design.md` on branch `tml-3415-row-locking-orm-client`: the design, amended through the reviews. It is the source of truth.
2. `projects/select-row-locking/plan.md` and `spec.md`: slices, open items, close-out steps, definition of done.
3. `projects/select-row-locking/reviews/code-review.md`: the in-loop review record for both slices. `reviews/branch-tml-3402/` and `reviews/branch-tml-3415/` hold the drive code review artefacts (system-design review and code review per slice). The `reviews/` folder is gitignored in this repo and was force-added on the slice 2 branch for this handover; remove it again at close-out.

The previous session's full transcript, for context on any decision: `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-postgres-for-update-prisma-4b201e/24d92fe1-3cd7-42d6-b638-c7f9b7cc1346.jsonl`. It is large; search it rather than read it whole. The persistent memory file `project-select-row-locking.md` under `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm/memory/` has the short version.

## State of the work

| Thing | Where | State |
|---|---|---|
| Design doc PR | prisma/orm#30542, branch `design/select-row-locking` | Draft. Redundant now: both slice branches carry `design.md` with later amendments. Will decides whether to close it. |
| Slice 1, typed SQL builder, TML-3402 | prisma/orm#30549, branch `tml-3402-row-locking-sql-builder`, base `main` | Built, reviewed in the loop, through the drive code review (15 findings fixed and confirmed). Awaiting Will's verification. `origin/main` was merged in twice; the second merge (commit `44a81f5f33`) plus regenerated migration snapshots (`5d456af315`) was pushed at handover without the post-merge local checks finishing, so read CI on it first. |
| Slice 2, ORM client, TML-3415 | prisma/orm#30555, branch `tml-3415-row-locking-orm-client`, base `tml-3402-row-locking-sql-builder` | Built, reviewed in the loop, through the drive code review (9 findings fixed and confirmed). Awaiting Will's verification. Last pushed commit before this handover commit: `0c7ad811a2`. |
| Linear | Project P-TML-1148 "Row locking clauses on a select" | TML-3402 and TML-3415 both In Review. |
| Asks | ask `01a0f2b5-d0cf-77ab-8bac-e058743af0a3` in prisma/asks | Deliverables: the issue, both tickets, both PRs. Journal says to reply to Emie on X once this ships. |

All remotes: push through the `bot` remote (`git@github-wmadden-electric:prisma/prisma.git`), never `origin`.

## What to do next, in order

1. **Read CI on prisma/orm#30549.** The push at handover contains the merge of `origin/main` at `5d664d5426` and regenerated snapshot contracts. The five merge conflicts were generated files under `examples/prisma-8-demo/migrations/snapshots/*/contract.json` and `examples/prisma-8-postgis-demo/migrations/snapshots/*/contract.json`; they were resolved by taking main's version and running `pnpm fixtures:emit`. Three source files auto-merged and were not yet checked locally after the merge: `packages/3-targets/6-adapters/postgres/src/core/descriptor-meta.ts`, `packages/3-targets/6-adapters/sqlite/src/core/adapter.ts`, `packages/3-targets/6-adapters/postgres/test/adapter-errors.test.ts`. If typecheck, lint or the adapter tests fail, the cause is most likely there. Fix with new commits.
2. **Merge slice 1's branch into slice 2's** (`git merge bot/tml-3402-row-locking-sql-builder` on `tml-3415-row-locking-orm-client`, a merge commit, never a rebase). Expect the same kind of generated-contract conflicts: take theirs, then `pnpm fixtures:emit` and `pnpm fixtures:check`. Then run the slice 2 gates and push.
3. **Recheck the upgrade-coverage rule on slice 2.** CI runs `pnpm check:upgrade-coverage --mode pr --prev <base sha> --head HEAD` with the PR base, which for slice 2 is slice 1's tip. Slice 2's notes live in their own fragment `upgrade-instructions/pending/orm-row-locking/` for that reason. Run the check locally with `--prev $(git rev-parse bot/tml-3402-row-locking-sql-builder)`, not the merge base with main.
4. **Whenever main moves**, any new or changed emitted Postgres contract on main lacks the seven capability keys and makes the `Fixtures` and `Integration Tests` checks fail on these PRs. The fix every time: merge `origin/main`, `pnpm fixtures:emit`, commit the regenerated files.
5. **DCO on merge commits.** The merge commits carry no sign-off line. If the DCO check objects, tell Will; do not rewrite history.
6. **When Will approves and slice 1 merges**: retarget prisma/orm#30555 to `main`, merge main in, regenerate, push.
7. **Close-out after both merge** (also in `plan.md`):
   - Satisfy the Asks ask (`pnpm -s asks ask satisfy --ask 01a0f2b5-d0cf-77ab-8bac-e058743af0a3 --reason "..."` from a prisma/asks checkout; read its `skills-contrib/asks/SKILL.md` first) and remind Will to reply to Emie on X. An agent token cannot post to X.
   - File Linear tickets for the follow-ups: map SQLSTATE `55P03` (`lock_not_available`) to a structured error code; type `AdapterProfile.capabilities` in `packages/2-sql/4-lanes/relational-core/src/ast/adapter-types.ts` as `CapabilityMatrix` so the Postgres runtime adapter can pass its profile to the renderer instead of the constant; port the Prisma 7 test "high concurrency with SET FOR UPDATE" once the integration suite has a real Postgres server; `include` together with a lock in the ORM, only if someone asks. Tickets must be self-contained (define terms, repo-relative paths, no slice names).
   - Move `design.md` to `docs/architecture docs/adrs/` as an ADR, strip references to `projects/select-row-locking/`, delete the folder (including the force-added `reviews/`), and close prisma/orm#30542 if still open.
   - Close GitHub issue prisma/orm#30531 if the PR merge did not.

## Decisions already made, so you do not reopen them

- Method names follow the SQL (`forUpdate({ skipLocked: true })`), not `lock('update')`. Serhii asked for this.
- Seven capability flags, one per method or option: `sql.forUpdate`, `sql.forShare`, `sql.lockOf`, `sql.lockNowait`, `sql.lockSkipLocked`, `postgres.forNoKeyUpdate`, `postgres.forKeyShare`. The survey of databases behind the split is in the design.
- The shared `LockingClause` node (`strength`, `of`, `waitPolicy`) carries no validity rule. The builder and the ORM refuse invalid combinations with one code, `ORM.LOCK_INCOMPATIBLE`, and `meta.conflict` from the `LockConflict` union in `packages/2-sql/4-lanes/relational-core/src/ast/locking.ts`, which also holds the flag maps and the wait-policy helper used by the builder, the ORM and the Postgres renderer.
- The Postgres renderer takes the capability matrix as a required parameter and refuses an unreported clause with `RUNTIME.AST_UNSUPPORTED`. SQLite refuses any lock with the same code.
- The ORM always renders `OF` the model's own table and offers no `of`. A lock with `include`, `groupBy`, `aggregate`, `distinct`, `distinctOn` or a mutation terminal is refused; a lock inside an include refinement is refused at the call with `conflict: 'includeRefinement'`.
- A lock outside a transaction is not refused; the docs state the lifetime.
- The budgets middleware keeps its own aggregate check on purpose (window functions do not collapse rows).

## How Will wants this run

Follow `~/.claude/CLAUDE.md` and the repo `CLAUDE.md`. In short: name yourself at session start; work through the Drive process (`/drive-process`) with implementer and reviewer subagents on Opus; run `/drive-code-review` on any substantial new change; use `mise exec --` for node, pnpm and commits; commit with `git commit -s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`; never amend, rebase or force-push; never add Claude attribution lines; never run the full integration or e2e suites locally; PR titles are `TML-NNNN: sentence`; turn on the CI monitor for any PR you open; write to Will briefly in plain language.

## Known environmental noise

`pnpm test:packages` fails locally on files these branches do not touch: three tarball tests (`@prisma/orm-framework` `all-shells-tarball` and `module-identity`, `@prisma/orm-target-postgres` `cross-shell-tarball`) on a registry trust check for `@vercel/detect-agent@1.2.5`, and timeouts under load in `render-typescript.roundtrip`, `cli-telemetry`, the `extension-supabase` integration files and occasionally `language-server`. Each passes alone. The `Supabase Acceptance` CI check fails on a Docker Hub rate limit; Will has said to ignore it.

## Not carried over

- The old worktree had a nested worktree at `wip/slice1` (slice 1's branch, with its own install) and a clone of prisma/asks at `wip/asks` with a working CLI config in `~/.config/prisma-asks/production.json`. Both are gitignored scratch. Recreate them if needed: `git worktree add` for the branch, and clone prisma/asks, `pnpm install --frozen-lockfile`, `pnpm build`.
- Saved gate output under `wip/*.txt` in the old worktree. It is evidence for results already recorded in `reviews/code-review.md`; you do not need it.
- A subagent was still running post-merge checks on slice 1 when this was written. Its result is superseded by CI on the pushed branch.
