# Handover: Data types own column types, slice 1

Written 2026-09-30 by thranduil-81, which stopped at a usage limit. Delete this file when slice 1's pull request opens.

## State

Branch `tml-3386-data-types-declare-names` on remote `bot`, stacked on `data-types-completion` (planning PR #30518, bound to the session with the CI monitor on). Tip `f4e89409e0`. No pull request yet.

All six dispatches (a to f) are accepted; see `slices/1/plan.md` notes and `slices/1/build-review.md`. The drive code review ran once; its artefacts are gitignored under `reviews/slice-1/` (regenerate by rerunning `/drive-code-review` with base `bot/data-types-completion`, no walkthrough, reviewers on Opus). The fix brief was `wip/briefs/review-fixes-1.md` (gitignored, may be gone); the 19 fixes are the 20 commits `01925ee865..f4e89409e0`, one per finding, with every check green apart from the known environmental failures (three tarball tests on the `@vercel/detect-agent@1.2.5` trust check; the telemetry e2e timeout). `test:packages:agent` needs `AGENT_CMD_TIMEOUT_SECONDS=2400`.

## Next steps

1. Fresh worktree; `git fetch bot tml-3386-data-types-declare-names`; `mise exec -- pnpm install && mise exec -- pnpm build`. Run everything through `mise exec --`.
2. In-loop reviewer round (Opus) on `01925ee865..f4e89409e0` against the two review artefacts' findings (code review F01 to F09; system design F01, F03 to F09, F11 to F15), recorded in `build-review.md`. Three items the implementer left open, to rule on: (a) an enum column referencing a `types {}` entry is now unquoted in the `ALTER COLUMN TYPE` postcheck (slice 3 design 12.3 replaces the postcheck; accept and note in the PR); (b) design 3.2 still says all of the Postgres target's `src/core/**` is shared plane, the config was narrowed; amend the design wording; (c) `DataTypeSupport.lookup` in `contract-psl` keeps its old name (predates the slice; leave).
3. Rerun `/drive-code-review` (substantial changes since the first run). Fix findings.
4. Open the PR: base `data-types-completion`, title `TML-3386: SQL data types declare their names, parameters and texts once`, body from `wip/pr-body.md` if it survives, else rewrite from `slices/1/plan.md` notes and `wip/pr-notes.md`; opening example first, decision, narrative, alternatives last; `Agent: <name>` line at the end; no AI attribution. Turn on the CI monitor with auto-fix. Delete this file in that PR.
5. Slice 2 (TML-3388) through the same loop. Rulings recorded in `slices/1/plan.md` for slice 2: the golden planner test is retired in slice 2's last dispatch; `deferred.md` lists two follow-ups.

## Rules

Will's rules from this session: never run the full `test:integration` or `test:e2e` suites locally (run the golden planner test, `test/integration/test/authoring/`, and files the diff touches; CI runs the rest); subagents on Opus; commit with `-s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`, no AI attribution; push only to `bot`; no amend, squash, rebase or force-push; working files under `wip/`; no question UI.
