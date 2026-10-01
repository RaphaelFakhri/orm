# Project plan — Rename hints in the contract source

**Spec:** `projects/rename-hints/spec.md` · **Linear:** [Rename hints in the contract source](https://linear.app/prisma-company/project/rename-hints-in-the-contract-source-7626c0107cd9)

## Slices

### Slice 1 — The hint attribute, the contract section, and model renames

- **Outcome:** `@@hint(was: "...")` in PSL and the equivalent on the TypeScript model builder lower to an unhashed `hints` section of `contract.json`; the snapshot store and migration directories strip it; the Postgres and SQLite planners take hints as an input, resolve each model hint against the origin schema with the spent, no-op and refusal rules, and plan the table rename plus companion renames through `applyTableRename`; `migration plan` reports the hints it consumed; the verbatim guard names the hint as its first remedy; the upgrade fragment and the language server reflect the attribute.
- **Builds on:** prisma/orm#30331 merged.
- **Hands to:** the contract section and its validation, the planner's hint input and resolution helper, and the consumed-hints report.
- **Linear:** TML-3422.
- **Branch:** cut from `main` after prisma/orm#30331 merges.

### Slice 2 — Field renames

- **Outcome:** `@hint(was: "...")` on a PSL field and the equivalent on the TypeScript field builder; a column rename operation on Postgres and SQLite with prechecks and postchecks, exported through each migration facade; the planner renames the column and every constraint and index whose name derives from it, including wire-named indexes whose content hash changes with the column name, instead of rebuilding them; model and field hints in one change compose.
- **Builds on:** slice 1.
- **Hands to:** the column rename operation and the companion-rename rules for column-derived names.
- **Linear:** TML-3423.

### Slice 3 — Remaining identity kinds

- **Outcome:** of namespace moves, enum value renames and explicitly named index or constraint renames, each that fits one review lands with its hint and planner behaviour on both targets; each that does not is deferred with a note in this plan and a follow-up issue.
- **Builds on:** slice 2.
- **Hands to:** nothing further.
- **Linear:** TML-3424.
- **Note:** the slice spec decides which kinds fit. An enum value rename may not be expressible while the planner refuses to modify native enum values.

## Sequencing

One stack: slice 1, then slice 2, then slice 3. Slice 2 needs slice 1's contract section and planner input. Slice 3 needs slice 2's composition rules and may be empty.

## Dependencies

- prisma/orm#30331 (rename-table operation) must merge before slice 1 is cut.
- Users get the feature through the next npm minor of the `@prisma/orm-*` packages after the last slice merges.

## Follow-ups filed outside this project

- MongoDB hints: collection rename and field rename as a document rewrite, reusing the contract section.
- Value hints: `cast` for type changes and `backfill` for new required columns, as further named arguments on the same attribute.

## Close-out (required)

- Verify every Project DoD item in `spec.md`.
- Write the ADR on planner hints in the contract source; amend ADR 001, ADR 028 and the Data Contract and Migration System subsystem docs to remove the "recorded in migration edges" text.
- Strip repo-wide references to `projects/rename-hints/**`.
- Delete `projects/rename-hints/`.
