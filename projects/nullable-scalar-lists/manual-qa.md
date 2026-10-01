# Manual QA — nullable scalar lists

> Be the user: author a notes application's list fields, inspect its emitted artifacts, store real data, and consume the changed contract as an extension author.
>
> Spec: [spec.md](spec.md). Oracle: [ADR 258](../../docs/architecture%20docs/adrs/ADR%20258%20-%20List%20cardinality%20has%20independent%20container%20and%20element%20nullability.md). Implementation: PR #30051, merge `982bca13644e9d7cdd9702c97a10d9d20482efeb`.
>
> Out of scope: rerunning CI, installing around trust-policy failures, editing implementation/examples/configuration, Prisma 7 engine compatibility, exhaustive codec or migration-transition coverage. This is a fresh scratch consumer, not an existing test invocation. Use already-built public package exports; this does not certify registry installation or tarball completeness.

## Table of contents

| # | Scenario | What it proves | Isolation | Covers |
| --- | --- | --- | --- | --- |
| 1 | Author PostgreSQL matrix and waiver | Emitted artifacts distinguish semantic nulls from waived enforcement; bad waiver has actionable diagnostics | tmpdir | D2, D3, D4, D5 |
| 2 | Store and read notes | Real PostgreSQL constraints enforce the matrix, runtime preserves nulls | tmpdir | D6, D7 |
| 3 | Author Mongo matrix | Public PSL and TS authoring produce correct item validators and types | tmpdir | D2, D4, D5, D8 |
| 4 | Consume contracts as an extension author | Scalar omission normalizes, storage cardinality is required, obsolete lists are rejected | tmpdir | D3 |
| 5 | Explore null-like values and type ergonomics | Empty lists, literal `null`, and static consumer types stay distinct | tmpdir | D4, D5 |

D1–D9 refer, in order, to the nine existing Project Definition of Done bullets in the spec, not new acceptance criteria. Both application and extension authors are covered. Extension authors consume the public serializer/IR rather than constructing a mock extension pack: this feature changes field metadata, not extension registration.

ADR 248 references below retain the oracle's number at execution time; its durable number is now ADR 258.

## Post-run script revision

The first run is preserved in [manual-qa-run.md](manual-qa-run.md). After execution completed, this script was corrected for the required language directive, per-target manifests, and the wire/in-memory cardinality distinction. Scratch programs named below contain those setup corrections. This revision is not a claim that the initial commands passed unchanged.

## Pre-flight

1. Record `git rev-parse HEAD`, `git status --short`, `node -v`, `pnpm -v`, and `date -Is` from the repository root. Node must satisfy root `engines.node` (>=24).
2. Use the implementation's reported 27 green CI checks and freshly built dist as the supplied prerequisite; do not claim locally blocked fixture/Prisma 7 checks passed. Do not rebuild or install dependencies.
3. Set `QA="$PWD/wip/nullable-scalar-lists-qa"`; verify `git check-ignore "$QA"`. Allocate `scenario-1` through `scenario-5`. The read-only dependency source is the current checkout's public dist, not a copied fixture or source import. Give `scenario-1/package.json` only the PostgreSQL facade dependency and `scenario-3/package.json` only the Mongo facade dependency; pass each directory as emission's `projectDir`. Scratch `node_modules` may link existing public package directories and existing PGlite, Mongo and TypeScript packages. This uses the existing installation without changing permissions, lockfiles or security settings.
4. Preserve the small consumer programs and full stdout/stderr under `$QA`; run from that directory. Programs use only documented/exported `@prisma/orm-*` entry points. Reference setup learned from `examples/prisma-8-demo/prisma.config.ts`, public package declarations, and scalar-list fixtures; do not invoke their tests/helpers.
5. Run scenarios 1 and 3 concurrently. Scenarios 2 and 4 consume scenario 1's contract. Scenario 5 consumes emitted types from 1 and 3. Global concurrency cap: 3. No scenario mutates shared database state.

## Scenario 1 — Author PostgreSQL matrix and waiver

**What you're proving from the user's seat:** A developer can express all four meanings and understand both output artifacts and a rejected waiver without reading implementation.

**Covers:** D2, D3, D4, D5.

**Isolation:** `tmpdir`.

**Oracle:** ADR 248's four-row matrix and semantic-nullability versus enforcement-waiver sections.

**Preconditions:** Public package builds available; no database needed.

### Steps

1. Run `node author.mjs > scenario-1/run.log 2>&1` from `$QA`.
2. The program authors `Note` with `id Int @id`, `strict String[]`, `elements String?[]`, `container String[]?`, `both String?[]?`, and `waived String[] @noCheck(elementNotNull)`. It uses the public PSL provider explicitly, then `executeContractEmit`. PSL still requires its `// use prisma-8` language-selection directive; retain that required directive without adding explanatory code comments.
3. Read `scenario-1/generated/contract.json` and `contract.d.ts`. Compare domain and storage `many`, whole-field `nullable`, `noCheck`, and each generated output type.
4. Inspect the negative-control diagnostic after replacing only `waived String[]` with `waived String?[]`.

### What you should see

Strict elements have `{ elementNullable: false }`; nullable elements have `{ elementNullable: true }`. Only the explicitly waived strict field carries `noCheck`. Canonical scalar domain and storage JSON omit the false cardinality default; both hydrate to `many: false`. Native storage cardinality remains required in the public in-memory `StorageColumn` type. The four generated types distinguish element union from container union. Bad waiver is rejected with a location and meaningful reason.

### Failure modes

Collapsed axes; automatic waiver on nullable elements; accepted inapplicable waiver; diagnostic with no useful field/reason. This negative control covers only `elementNotNull` on one nullable string list, not every malformed annotation.

### Restore

Keep evidence in ignored scratch; run `git status --short` at repository root. No tracked input was changed.

## Scenario 2 — Store and read notes

**What you're proving from the user's seat:** A real notes application can write/read null elements while the database independently refuses prohibited nulls.

**Covers:** D6, D7.

**Isolation:** `tmpdir`.

**Oracle:** ADR 248 matrix; `noCheck` does not change declared element types.

**Preconditions:** Scenario 1 succeeded; existing PGlite/socket packages available.

### Steps

1. Run `node storage.mjs > scenario-2/run.log 2>&1` from `$QA`.
2. Start fresh in-memory PGlite on loopback and initialize it through `createPostgresControlClient().dbInit({ mode: 'apply', contract, migrationsDir })`. Inspect actual catalog constraints, not just a proposed plan.
3. Run schema verification while the control connection is open, then close it before opening the application on the single-connection socket. Write/read using `.create()` and `.select(...).all()` through `postgres({ contractJson, url }).orm`. Include non-null lists, null elements, empty lists, and null containers where allowed. Log full selected row shapes.
4. Use direct SQL as a hostile independent writer: insert a null element into each strict list; insert a whole-list null into each required list. Each must fail with a useful database constraint diagnostic. Then insert null elements into the explicitly waived strict list and read the stored value directly.
5. Inspect the pre-write control API verification result. Confirm waived NULL with SQL `waived[1] IS NULL`, rather than trusting the PGlite direct array decoder's text rendering. Quote the reserved identifier `"both"` in raw SQL.

### What you should see

Only strict/container fields have element checks; required fields retain NOT NULL. Nullable elements round-trip through the actual runtime. Waived storage permits null elements independently of the type declaration. Database verification is clean.

### Failure modes

Missing strict enforcement; nullable fields rejected; nulls lost or stringified; spurious verification drift. Negative controls cover these columns on a fresh database, not historical migrations or all codecs.

### Restore

Close application client, control client, socket server and in-memory database in `finally`; record `git status --short`.

## Scenario 3 — Author Mongo matrix

**What you're proving from the user's seat:** A Mongo application author sees the same matrix through its own public APIs, including emitted BSON constraints.

**Covers:** D2, D4, D5, D8.

**Isolation:** `tmpdir`.

**Oracle:** ADR 248 Mongo item-schema rules and the matrix.

**Preconditions:** Public Mongo dist available. No dependency on scenario 1.

### Steps

1. Run `node mongo.mjs > scenario-3/run.log 2>&1`.
2. Author matching PSL fields with ObjectId `_id`, emit through the public control API, and inspect `storage.collections` validators and declaration output.
3. Author all four cells through `defineContract`, `model`, and `field.string().many({ elementsNullable: true })`, using `.optional()` for Mongo whole-field nullability. Compare markers with PSL.
4. Run `node mongo-live.mjs > scenario-3/live.log 2>&1` to attempt a local Mongo memory server without distro overrides, downloaded replacement binaries or permission changes. If available, create the collection with the emitted validator, insert nullable data, and plant strict-array violations. If unavailable, record this as blocked; validator inspection is not live BSON enforcement.

### What you should see

Nullable array items admit BSON `null`; strict items do not. Container nullability remains independent. Generated declarations and TS authoring preserve the matrix. A running Mongo rejects strict-item violations.

### Failure modes

Wrong item schema, dropped container optionality, TS authoring mismatch, or accepted strict-item violation. Server startup failure is an environment limitation, not a feature success or regression.

### Restore

Stop any started server/client in `finally`; preserve logs only in scratch and record `git status --short`.

## Scenario 4 — Consume contracts as an extension author

**What you're proving from the user's seat:** An extension integrating the public target serializer can migrate its field reader deliberately, rather than interpreting legacy list JSON silently.

**Covers:** D3.

**Isolation:** `tmpdir`.

**Oracle:** ADR 248 domain omission normalization and deliberate nested-list wire migration.

**Preconditions:** Scenario 1's emitted JSON available.

### Steps

1. Run `node extension.mjs > scenario-4/run.log 2>&1`.
2. Deserialize the emitted contract with the public `PostgresContractSerializer`. Log scalar domain `many: false`, explicit storage scalar `many: false`, and nested list descriptors.
3. Serialize it again and inspect canonical emitted JSON separately: scalar domain omission is canonicalization behavior, not necessarily raw serializer omission.
4. On independent copies, remove storage scalar `many` and observe normalization to false; replace a domain list with legacy `many: true`, replace storage list cardinality with `true`, and introduce a sibling `elementNullable`. Log the latter rejections and assess whether the offending shape is identifiable. Scenario 5 separately compiles a missing in-memory `StorageColumn.many` negative control.

### What you should see

Valid scalar wire omission loads; in-memory storage cardinality remains required. Legacy/malformed shapes fail loudly. Re-emission preserves strict nested `elementNullable: false`.

### Failure modes

Accepted obsolete list JSON, missing required in-memory storage cardinality accepted by TypeScript, valid scalar wire omission rejected, or unusable diagnostics. These negative controls cover planted old shapes, not archival release snapshots; no claim of exhaustive previous-release compatibility.

### Restore

All mutations are fresh in-memory copies; preserve log and record `git status --short`.

## Scenario 5 — Exploratory: null-like values and type ergonomics

**Charter:** Explore public consumer types and the difference between `[]`, `[null]`, `["null"]`, and `null`, using the artifacts and runtime from the preceding scenarios. Assess whether an application author can understand the distinction from generated declarations and diagnostics alone.

**Covers:** D4, D5; additional discoveries are not new acceptance criteria.

**Isolation:** `tmpdir`.

**Preconditions:** Scenarios 1 and 3 generated declarations. Runtime probes may use scenario 2's own isolated database before it closes.

**Time budget:** Maximum 10 minutes; stop on charter completion or timeout.

**Notes capture:** Preserve a scratch TS consumer with positive assignments for all four generated types and negative assignments without suppression comments. Run its local `pnpm typecheck` script separately on positive and negative inputs; inspect actual diagnostics. Also inspect inferred no-emit SQL/Mongo builder types. Use `.optional()` for container nullability on both public builders; ADR 248's `.nullable()` spelling was observed to be unsupported. The prepared commands are `pnpm typecheck` and `pnpm typecheck negative.ts`; retain their separate exit codes. Note any unavailable probes explicitly. Do not turn this into a workspace typecheck or rerun existing type tests.

**Restore:** Keep only ignored evidence; verify the final working-tree diff includes only the two requested Markdown files.

## Scenarios deliberately not in this script

| Requirement | Rationale |
| --- | --- |
| D1 team floor / all implementation tests | Independent project audit and supplied CI; rerunning suites adds no fresh consumer evidence |
| D2 exhaustive formatter and semantic-printer scope | Existing parser coverage; this script judges fresh authoring/emission, not a duplicate grammar suite |
| D6 historical add/drop migration transitions | Fresh storage smoke only; lifecycle CI owns the exhaustive transition graph |
| D8 all Mongo codecs and ORM behavior | Live execution attempted but environment-dependent; emitted validator inspection alone cannot satisfy this portion |
| D9 ADR completeness | ADR is the oracle; independent audit/retro owned by orchestrator |
| Value-object lists, SQLite, nested/relation lists | Explicit project non-goals or not close-out gates |
| Registry/tarball install | Known trust-downgrade refusal must not be bypassed; linked public builds do not prove installability |

## Sign-off coverage map

| DoD bullet | Scenarios |
| --- | --- |
| D1 | Independent audit / supplied CI |
| D2 | 1, 3; formatter portion deferred to CI |
| D3 | 1, 4 |
| D4 | 1, 3, 5 |
| D5 | 1, 3, 5 |
| D6 | 2; transitions deferred to CI |
| D7 | 2 |
| D8 | 3; live server availability must be reported |
| D9 | Independent audit |
