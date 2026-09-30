# Handover: Data types own column types, slice 1

Written 2026-09-30 by romulus-48, which stopped before a usage limit. Delete this file when slice 1's pull request opens.

## What the project is

The project finishes ADR 254 (data types and casts). Today each column stores a free-text `nativeType` string. At the end, every column type comes from a declared data type:

- targets and extensions declare their data types with `sqlDataType` (SQL) or `mongoDataType` (Mongo);
- the contract stores `dataType` instead of `nativeType`;
- verify compares data type ids and parameters exactly;
- `contract infer` prints the constructor marked `inferred`, and fails on a database type that no data type claims.

Read these in order. They leave the implementer no design choices:

1. `projects/data-types-completion/spec.md`: goal, non-goals, slice order, definition of done.
2. `projects/data-types-completion/design.md`: the implementer contract, section by section. Slice 1 is sections 2 to 6.
3. `projects/data-types-completion/plan.md`: checks to run, grep checks, and halt conditions.
4. `projects/data-types-completion/slices/1/plan.md`: slice 1's dispatches a to f and the notes added while building.
5. `projects/data-types-completion/design-notes.md`: every decision with its reasons. Will's rulings are marked. Do not reopen them.
6. `projects/data-types-completion/slices/1/build-review.md`: the in-loop reviewer's verdicts for dispatches a to c.

Linear: project P-TML-1145 "Data types own column types". Planning ticket TML-3385. Slices, in build order: TML-3386 (slice 1, building), TML-3388 (slice 2), TML-3387 (slice 3, starts after TML-3253), TML-3389 (slice 4, starts after TML-3367).

## Where things are

- Planning pull request: https://github.com/prisma/prisma/pull/30518, branch `data-types-completion`. It is open and waiting for Will's review. Its checks were green. Bind it with the `ccd_pr` tools and turn on the monitor with auto-fix and address-comments.
- Slice 1 branch: `tml-3386-data-types-declare-names`, pushed to remote `bot`. It is stacked on `data-types-completion`. No pull request yet.

To start: create a fresh worktree, then `git fetch bot tml-3386-data-types-declare-names` and check it out. Run every `node`, `pnpm` and `git commit` through `mise exec --` (`.tool-versions` pins Node 24.16.0). Run `mise exec -- pnpm install` and `mise exec -- pnpm build` before tests.

## Slice 1 state

Dispatches a, b and c are accepted (see the slice plan and `build-review.md`).

Dispatch d is partly built and not reviewed:

- Commit `7565a8f8f9` moves the Postgres and SQLite `authoring.dataTypes` entries from the adapters to the targets, and removes the stub adapter entries from the composed-stack test. Check both against the brief below.
- Commit `45fe7b6423` is unfinished work. It removes `nativeType` from constructor and preset templates, adds `storedSqlTypeName` and `storedSqlTypeNameOfCodec` in `packages/2-sql/1-core/contract/src/sql-data-type.ts` with tests, adds a contract error subcode, and adds `inferred` marks to Postgres constructors. The workspace does not typecheck at this commit. The implementer stopped while starting the `contract-ts` writers (`buildSqlContractFromDefinition` and `buildStorageColumn`).

Next steps:

1. Start a new implementer and a new reviewer, both with `model: "opus"`. Give the implementer the dispatch d brief below. Tell it to read the diff of `bae87ef093..45fe7b6423` first and finish what is missing.
2. The reviewer reviews dispatch d against the brief and the design. Loop until it is satisfied. Record "Dispatch d accepted" in the slice plan.
3. Dispatches e and f, from the slice plan table and notes. Dispatch e re-records the `codec-instance.json` golden (its message changes; that is not a halt). Dispatch f writes the extension-audience upgrade instruction of design section 6, and an app-audience declaration if `check:upgrade-coverage --mode pr` asks for one.
4. Run `/drive-code-review` on the slice, without the walkthrough. Fix what it finds.
5. Open the pull request with base `data-types-completion`. Title `TML-3386: <one sentence>`. Put `Agent: <your name>` in the description. Turn on the CI monitor with auto-fix at once.
6. Continue with slice 2 (TML-3388) through the same loop, without asking Will. Go back to Will only if new information makes the design wrong.

Known environmental failures in `pnpm test:packages`: three tarball tests fail in `pnpm install` on a registry trust check ("High-risk trust downgrade for @vercel/detect-agent@1.2.5"), and the telemetry e2e test times out under load but passes alone. The framework vocabulary count must stay at or below 272.

## Dispatch d brief (send as written)

Dispatch d of `projects/data-types-completion/slices/1/plan.md`: writers, templates, bounds, authoring entries and assembly checks. Re-read design sections 2.4, 3 item 1, 4 and 5, 13.4 (the Postgres marks), 9.5 (SQLite and Mongo constructors carry no marks), and the slice plan's notes.

Build exactly this:

1. **Writers** (design 4): every writer of a column's or `storage.types` entry's `nativeType` writes `sqlBaseName` of the codec's data type with the column's `dataTypeParams`, except a `claimsKind` type (`pg/enum`), which writes `typeParams.typeName` unquoted. Writers: `buildStorageColumn`, the `type.*` helpers' results, `types {}` aliases, raw `storage.types`, constructor and preset resolution in `contract-psl`, the Prisma 7 source. The value-object column keeps `jsonb`. `buildSqlContractFromDefinition` requires `codecLookup` and a new `dataTypeLookup` argument; update every caller. `ColumnTypeDescriptor.nativeType` becomes optional and is ignored.
2. **Templates** (design 4): `AuthoringStorageTypeTemplate` loses `nativeType`; a constructor or preset output is `{ codecId, typeParams? }`. Remove `nativeType` from every constructor and preset template (Postgres, SQLite, SQL family, pgvector, postgis, Mongo, the framework's temporal presets) and from `assertResolvableTypeConstructorTemplates`'s requirement. Mongo's interpreter reads `nativeType` only for a deprecation message: take the replacement name from the constructor instead. Constructors gain an optional `inferred: true`; set it on exactly the Postgres constructors listed in design 13.4 that exist today (the three new constructors `Bit`, `VarBit`, `Interval` come in slice 3; do not add them). `postgis.Geometry`'s `srid` becomes optional.
3. **Bounds** (design 2.4 items 2 and 3): arguments mapped onto a data type parameter lose `minimum` and `maximum`; validation is the codec's `paramsSchema` on the resulting `typeParams`, reported at the argument with `PSL_INVALID_ATTRIBUTE_ARGUMENT` and the schema's message (TypeScript `type.*` helpers: the same check, reported as they report argument errors today). Keep the `size` bounds (2 to 255) of the `nanoid` and `id.nanoid` presets. Delete the temporal presets' shared `precision` bound. Tests at every changed edge, red first.
4. **Authoring entries move** (design 3 item 1): `authoring.dataTypes` (tags, plain entries, number classifier) move from the Postgres and SQLite adapters to their targets. Remove the entries added to the stub adapter in the composed-stack test.
5. **Assembly checks** (design 5), tests first, one per check: in `enforceDataTypeInvariants` (framework): a constructor or preset names a codec for which `codecLookup.descriptorFor` returns nothing; a constructor maps an argument onto a key neither its data type's `params` nor its codec's own keys declare; two constructors of one data type both marked `inferred`. New `enforceSqlDataTypeInvariants(stack)` in `packages/2-sql/9-family/src/core/assembly.ts`, called at the start of `createSqlControlFamilyInstance`: claiming texts collide (either text's pattern matches the other with each placeholder replaced by `1`), or two data types claim one kind. Delete `validateScalarTypeCodecIds`. Error messages name the contributor and the id.

Out of scope: planners, `typeRef` writing, runtime casts, `SAFE_WIDENINGS`, enum blocks, the Mongo validator, the Prisma 7 binding's `literalDefaultForm`, and every deletion in design 3 item 3 other than `validateScalarTypeCodecIds` (dispatch e).

Done when: tests red first then green; `mise exec -- pnpm test:packages:agent` passes apart from the known environmental failures (name them); root `typecheck:agent`; `lint:deps`; biome; vocabulary at or below 272; `fixtures:check:agent` shows no change; the golden planner test passes unchanged. Halt if any `contract.json`, `contract.d.ts` or golden would change. Report in under 350 words.

## Rules that apply to every step

- Subagents run on Opus: pass `model: "opus"` on every dispatch. Never Fable.
- Commit with `git commit -s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`. No AI attribution lines, in commits or pull requests. Put that rule in every subagent brief.
- Push only to remote `bot`. Never push to `main`. Never amend, squash, rebase or force-push.
- Keep working files in the worktree under `wip/` (gitignored), never in `/tmp`.
- Do not use the question UI or `spawn_task`. Write to Will in plain language, briefly.

## Transcript

The previous session's transcript has every discussion with Will and every ruling. Will authorizes reading it, although it is outside the worktree:

`/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-slice-b-handover-pr-30350-871eb0/ac0546b9-21d9-483f-acef-afd389d18e5c.jsonl`

It is a 9.6 MB JSON Lines file. Search it; do not read it whole. The subagent transcripts are in the `ac0546b9-21d9-483f-acef-afd389d18e5c/subagents/` folder next to it.
