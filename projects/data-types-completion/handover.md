# Handover: Data types own column types, slices 1 and 2

Written 2026-10-01 by thranduil-81, which stopped at a usage limit. Delete this file when slice 2's pull request opens.

## Transcript

Will authorizes reading the previous session's transcript, although it is outside the worktree: `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-data-types-column-types-slice-1-6392eb/4ac77654-fa96-45f2-9ce6-8b3fa656fe30.jsonl`. It is large; search it, do not read it whole. Subagent transcripts are in the `4ac77654-fa96-45f2-9ce6-8b3fa656fe30/subagents/` folder next to it. Every ruling in it is also written into `slices/1/plan.md` and `slices/2/plan.md` notes, so the transcript is for context only.

## Read these first

1. `projects/data-types-completion/spec.md`, `design.md` (slice 2 is sections 7 to 10), `plan.md`, `design-notes.md`.
2. `slices/1/plan.md` (notes at the end are rulings), `slices/2/plan.md` (dispatch table and rulings), `slices/2/build-review.md` (the reviewer's findings, all closed through dispatch b).
3. `slices/2/briefs/`: the exact briefs used for dispatches a to d, the shared rules every subagent gets (`common-rules.md`), and the reviewer's standing brief. `s2b-default-rewrites.md` holds the SQLite default rewrite rules dispatch d must apply.
4. `slices/1/pr-body.md`: the slice 1 pull request description as published.
5. `deferred.md`: follow-ups to file at close-out.

## State

- **Slice 1, PR #30547** (https://github.com/prisma/orm/pull/30547), base `data-types-completion`, waiting for Will's review. CI monitor with auto-fix is on in the old session; bind it again with the `ccd_pr` tools and turn the monitor on. Its last pushes were a CI fix (four integration tests) and the shrink of the planner goldens to a hash manifest. Nothing is pending on it.
- **Planning PR #30518**, waiting for Will's review.
- **Slice 2, branch `tml-3388-data-type-in-contract`** on remote `bot`, stacked on slice 1 (merge slice 1 in when it changes; never rebase). Dispatches a and b are accepted. Dispatch c (`db sign` over every space; `migrate` names `db sign`) is partly built: three commits (`3190ecd3bd` migrate message, `dda8c4e356` `withTransaction` on both adapters, `596626b778` families sign several spaces in one transaction) plus a work-in-progress commit of the CLI `db sign` command if the implementer managed it before the limit; otherwise the CLI part (`packages/1-framework/3-tooling/cli/src/control-api/operations/db-sign.ts` and the callers in `client.ts`, `db-verify.ts`, `fixture-client.ts`, `types.ts`, `exports/control-api.ts`) is unfinished. Check `git log` and `git status` on the branch.
- Expected red until dispatch e regenerates every committed contract: about 96 package test files that read committed fixtures, the golden planner test, four authoring integration files, and 20 typecheck tasks over committed `contract.d.ts` files (listed in `slices/2/plan.md` and `build-review.md`). `fixtures:check` fails until then. Do not patch fixtures by hand.

## Next steps

1. Fresh worktree; `git fetch bot tml-3388-data-type-in-contract` and check it out; `mise exec -- pnpm install`; `mise exec -- pnpm build` (expect `prisma-8-postgis-demo` to fail on its committed contract; that is known). Run every `node`, `pnpm` and `git commit` through `mise exec --`.
2. Finish dispatch c with a fresh Opus implementer from `slices/2/briefs/s2-dispatch-c.md`, telling it to read the diff of the commits above and the working tree first. Then a reviewer round (brief `slices/2/briefs/reviewer.md`; record in `build-review.md`). Loop until satisfied; record "Dispatch c accepted" in the slice plan.
3. Dispatch d from `slices/2/briefs/s2-dispatch-d.md`; review.
4. Dispatch e (regenerate everything, the skill's proof, re-record then the golden manifest) and f (docs, ADR 254 Accepted, retire the golden planner test, full checks) per the slice plan table; write their briefs in the same shape.
5. `/drive-code-review` without the walkthrough (base `bot/data-types-completion`, reviewers on Opus, artefacts under `projects/data-types-completion/reviews/slice-2/`, which is gitignored); fix findings; rerun after substantial fixes. Then manual QA per `spec.md` "Project definition of done", recorded in `slices/2/manual-qa.md`.
6. Open the PR: base `data-types-completion` (or `main` if the planning PR merged), title `TML-3388: <one sentence>`, description in the shape of `slices/1/pr-body.md` (opening example, decision, narrative, alternatives last, `Agent: <name>` at the end, no AI attribution). Turn on the CI monitor with auto-fix. Delete this file in that PR.

## Rules from Will that apply

- Never run the full `test:integration` or `test:e2e` suites locally: run the golden planner test, `test/integration/test/authoring/`, and files the diff touches; CI runs the rest. Put this in every brief.
- Subagents on Opus (`model: "opus"`), never Fable. One implementer and one reviewer per dispatch; a fresh implementer when the context grows past about 500k tokens, because large ones stalled under machine load.
- Commit with `git commit -s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`; no AI attribution anywhere; push only to `bot`; never amend, squash, rebase or force-push; `main` is merged in, never rebased.
- Working files under `wip/` (gitignored); never `/tmp`. No question UI, no `spawn_task`. Report to Will briefly, in plain English; do not interrupt him for engineering decisions.
- Known environmental failures: three tarball tests fail in `pnpm install` on "High-risk trust downgrade for @vercel/detect-agent@1.2.5"; the telemetry e2e test and the adapter-postgres round-trip tests time out under load but pass alone. `test:packages:agent` needs `AGENT_CMD_TIMEOUT_SECONDS=2400`; `fixtures:check:agent` needs 1200.
