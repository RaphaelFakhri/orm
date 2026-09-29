# Project plan: data types own column types

Spec: [`spec.md`](spec.md). Design: [`design.md`](design.md). Linear project: Data types own column types.

## Slices

| # | Slice | Ticket | Branch | Design sections | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Each SQL data type declares its name, parameters and texts; every copy of those facts is deleted | TML-3386 | `tml-3386-data-types-declare-names` | 2 to 5 | nothing |
| 2 | Introspection resolves reported types through the declarations; verify compares exactly; infer prints constructors and fails on unclaimed types | TML-3387 | `tml-3387-resolve-reported-types` | 6 to 8 | slice 1 merged; TML-3253 merged |
| 3 | The contract stores `dataType`; SQLite's data types are corrected; upgrade script; `db sign` signs every space; ADR 254 accepted | TML-3388 | `tml-3388-data-type-in-contract` | 9 to 12 | slice 2 merged |
| 4 | Default function arguments, enum member values and discriminator values are checked by the cast rule | TML-3389 | `tml-3389-typed-written-values` | 13 | slice 1 merged; TML-3367 merged |

Each slice is one pull request against `main`, titled `TML-NNNN: <sentence>`. Slice 4 does not depend on slices 2 or 3 and may run beside them once TML-3367 has merged.

```
main ── 1 ──┬── 2 ── 3
            └── 4 (after TML-3367)
```

## How each slice is built

One implementer (Fable) and one reviewer (Opus), resumed across dispatches, per the Drive process. Every subagent brief says: run commands through `mise exec --`; add no AI attribution lines; stage files explicitly; sign off with both trailers. After the build loop, `/drive-code-review` runs on the slice without the walkthrough, its findings are fixed, and it runs again after substantial changes. Manual QA follows slice 3.

The slice plan with dispatches is written at build time as `slices/<n>/plan.md`. Dispatch outlines, to be confirmed against `main` when each slice starts:

**Slice 1.** (a) Framework `params`, the family's `sqlDataType`, `renderSqlTypeName`, `renderSqlCatalogText`, with unit tests. (b) Postgres, pgvector and postgis declarations and the per-pack declaration tests; registration and constructors move to the targets. (c) SQLite declarations, including the two character types; Mongo `mongoDataType`. (d) Readers switch and the copies are deleted: planners, runtime casts, enum blocks, Prisma 7 binding, Mongo validator; type constructor and preset templates lose `nativeType`; new assembly checks. (e) ADR 171 note, codec authoring guide, full checks.

**Slice 2.** (a) Introspection hands over `ReportedSqlType`; the resolver; schema IR carries `dataType`; equality. (b) Postcheck from catalog texts; default parsers take the codec by the rule in design 7.4. (c) Infer receives the stack, prints marked constructors, fails on unclaimed; `Bit`, `VarBit`, `Interval`; `Unsupported` removed. (d) The test-only extension journey and the real-database matrix. (e) Docs and full checks.

**Slice 3.** (a) Contract types, validators, builder, descriptor, emitter, JSON Schema; the refusal of old contracts. (b) SQLite data types and canonical forms. (c) The upgrade script for both audiences, with its proof run. (d) `db sign` for every space; the `migrate` message. (e) Regenerate every fixture, example, extension contract space and snapshot. (f) ADR 254, docs, upgrade instruction text, full checks, then the manual QA run of the spec's definition of done.

**Slice 4.** (a) Shared signatures and limits; reporting of a registered function's own diagnostics. (b) Prisma 7 reader; generators' applicable data types. (c) Enum member values; discriminator values. (d) Docs, error reference, full checks.

## Checks every slice runs

Through `mise exec --` and the `:agent` variants, reading the log file each prints: `pnpm build`, `pnpm typecheck`, `pnpm test:packages`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm lint`, `pnpm lint:deps`, `pnpm lint:docs`, `pnpm lint:throws`, `pnpm lint:framework-vocabulary`, `pnpm check:error-reference`, `pnpm coverage:packages`, `pnpm fixtures:check`, `pnpm check:upgrade-coverage --mode pr`.

## Grep checks

| After slice | Command | Allowed output |
| --- | --- | --- |
| 1 | `git grep -n "targetTypes\|targetTypesFor\|byTargetType\|expandNativeType\|nativeTypeFor\|typeMetadataRegistry\|normalizeNativeType" -- packages` | nothing |
| 2 | `git grep -n "normalizeFormattedType\|normalizeSchemaNativeType\|normalizeSqliteNativeType\|FORMAT_TYPE_DISPLAY\|buildExpectedFormatType\|POSTGRES_TO_PSL\|PRESERVED_NATIVE_TYPES\|PARAMETERIZED_NATIVE_TYPES\|CODEC_ID_BY_INFERRED_TYPE\|resolvedNativeType\|codecBaseNativeType" -- packages` | nothing |
| 2 | `git grep -n "Unsupported(" -- packages test examples` | the Prisma 6 and Prisma 7 schema readers, their fixtures and tests |
| 3 | `git grep -n "nativeType" -- packages examples test` | the Prisma 6 and Prisma 7 schema readers where it names `@db.*` attributes; the old-contract refusal and its test; the upgrade script and its fixtures; `SqlColumnIR.nativeType` |
| 4 | `git grep -n "applicableCodecIds\|FUNCTION_ARGUMENT_KEYS" -- packages` | nothing |

## Halt conditions

Stop and report to the orchestrator; do not choose an alternative.

- Any committed contract changes in slice 1 or 2.
- Any `ops.json` changes after `pnpm migrations:regen` in slice 1 or 2.
- A reported text from a real database that no row of design 2.6 covers for a type that has a data type.
- A column in a committed contract whose codec's data type would not reproduce its stored `nativeType`.
- The upgrade script's output differs from regeneration for any file.
- `pnpm lint:framework-vocabulary` would need its threshold raised.
- The design is silent on a choice the implementation needs.

## Retro triggers

Any halt condition; a reviewer round that finds a class of defect the design should have prevented; a slice needing more than ten dispatches.

## Close-out

After slice 4 merges: final retro; map every decision in `design-notes.md` to its durable home (ADR 254, ADR 129, the codec authoring guide, package READMEs, Linear) and list the mapping in the close-out pull request; close TML-3283 with the recorded answer; delete `projects/data-types-completion/`.
