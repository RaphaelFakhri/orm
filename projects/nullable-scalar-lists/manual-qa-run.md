# Manual QA run — nullable scalar lists

- **Verdict: Fail — Mongo nullable containers are rejected by the emitted BSON validator.** No implementation fix was attempted.
- Script: [manual-qa.md](manual-qa.md). Runner: delegated fresh consumer QA agent, not the implementation author.
- Commit: `982bca13644e9d7cdd9702c97a10d9d20482efeb`; branch `close-nullable-scalar-lists`.
- Environment: Linux/NixOS, Node `v24.21.0`, pnpm `10.27.0`, existing public dist `8.0.0-rc.14`, PGlite `0.4.3` / socket `0.1.3`, existing Mongo memory-server installation.
- Started / finished: `2026-10-01T15:47:00Z` / `2026-10-01T16:00:31Z`.
- Evidence root: `wip/nullable-scalar-lists-qa/` (ignored; retained locally). Setup program: `/tmp/nullable-qa-setup.py`. These artifacts are not committed or portable without copying them.

## Summary

Five scenarios executed: **4 passed their feature probes after scratch setup corrections, 1 failed**. Mongo nullable elements work and strict elements are rejected, but explicit null containers fail actual BSON validation even though generated TypeScript accepts them. Two findings require owner disposition: one High product mismatch and one Follow-up ADR issue. A third Follow-up concerned the QA script and was corrected after execution, with the original failures retained. No failed strict-element guard, data loss, or corruption was observed; the High finding nevertheless prevents an unconditional close-out recommendation.

This is a fresh notes consumer using public `@prisma/orm-*` exports, real PGlite storage and a real Mongo memory server, not a rerun/relabel of implementation tests. The supplied 27 green CI checks and fresh build were prerequisites, not reverified here. No dependency installation, root build, security bypass, implementation modification, staging, commit or push occurred.

## Findings

### F-2 — High — Mongo validator rejects nullable list containers

**Scenario:** 3, live BSON storage. **Oracle:** ADR 248 and generated `contract.d.ts` promise `ReadonlyArray<string> | null` and `ReadonlyArray<string | null> | null` for `container` and `both`.

Command, from the evidence root:

```bash
node mongo-live.mjs > scenario-3/live.log 2>&1
```

Exit 0 means the probe completed, not that all feature expectations passed. The program creates the collection using the emitted `$jsonSchema` without modifying it. Actual output:

```text
{
  _id: new ObjectId('6abe824101754662bc245e07'),
  strict: [],
  elements: [ null ],
  both: [ 'ok', null ]
}
REJECTED strict [ null ] 121 Plan executor error during update :: caused by :: Document failed validation
REJECTED both null 121 Plan executor error during update :: caused by :: Document failed validation
REJECTED container null 121 Plan executor error during update :: caused by :: Document failed validation
CLOSED
```

The strict negative control correctly fails. The latter two updates should succeed according to the nullable contract. Emitted properties have `bsonType: 'array'` rather than admitting container null; optional fields are merely excluded from `required`. Nullable item schemas correctly contain `['null', 'string']`.

**Reproduction artifacts:** `mongo-live.mjs`, `scenario-3/schema.prisma`, `scenario-3/generated/contract.json`, `scenario-3/generated/contract.d.ts`, `scenario-3/live.log`. HEAD is recorded in `head.txt`. The baseline tracked tree was clean; only this dispatch's two Markdown files were written at the initial failure, with concurrent orchestrator artifacts appearing later (final status below). All planted data was confined to an ephemeral Mongo database, closed in `finally`.

**Proposed disposition:** fix-in-PR / follow-up implementation PR before closing this project. Investigate nullable container lowering in the Mongo BSON derivation, and reconcile public types with storage semantics. This QA does not establish whether the defect predates #30051; it establishes that the merged consumer matrix is inconsistent. No ticket was filed and no fix is authorized in this dispatch.

### F-3 — Follow-up — ADR 248's `.nullable()` example is not the public SQL builder API

**Scenario:** 5, fresh typed application. The ADR's example produces:

```text
types.ts(9,229): error TS2339: Property 'nullable' does not exist on type 'ScalarFieldBuilder<...>'.
```

Full diagnostic: `scenario-5/positive.log`. Public declarations expose `.optional()`, not `.nullable()`. Replacing those two scratch calls with `.optional()` made `pnpm typecheck` exit 0 (`scenario-5/positive-final.log`), and runtime construction preserved the correct four descriptors (`scenario-5/no-emit.log`).

**Proposed disposition:** fix-in-PR, documentation-only correction to ADR 248. No architecture doc was edited under this dispatch's scope.

### F-1 — Follow-up — Initial QA script assumptions needed correction

This is runner/script quality, not a feature regression. Initial evidence is retained rather than overwritten:

| Evidence | Observed failure | Correction limited to scratch |
| --- | --- | --- |
| `scenario-1/run.log`, `scenario-3/run.log` | `CONTRACT.SOURCE_LOAD_FAILED`: `No schema file carries the "// use prisma-8" directive` | Preserve the required language-selection directive; explicit provider selection alone is insufficient. No explanatory code comments added |
| `scenario-1/retry.log`, `scenario-3/retry.log` | `CLI.PROJECT_MANIFEST_INVALID`: `an application may depend on only one database facade` | Give each target its own scratch manifest and `projectDir` |
| `scenario-3/final.log` | `field.objectId(...).map is not a function` | Use `_id` as the Mongo builder field name |
| `scenario-2/run.log` | `ERR_INVALID_ARG_TYPE`, undefined migrations directory | Supply required `migrationsDir` to `dbInit` |
| `scenario-2/retry.log` | `app.orm.public.Note.insert is not a function` | Use documented ORM `.create()` |
| `scenario-2/final.log`, `scenario-2/completed.log` | Connection terminated unexpectedly while switching socket clients | Use the single-connection PGlite socket sequentially, verify before closing control, then run application |
| `scenario-2/sequential.log` | SQL syntax error near unquoted reserved word `both` | Quote the scratch raw SQL column identifier |
| `scenario-4/run.log` | `ACCEPTED missing-storage-many` | Distinguish required in-memory cardinality from canonical wire-default omission; compile-time probe confirms the actual required property |

Storage wire omission is **not a failed product guard**: canonical emission itself omits scalar storage `many`; the public serializer normalizes it to false. The spec/ADR's required `StorageColumn.many` is an in-memory type requirement, empirically checked below. Legacy `many: true` remains rejected on both surfaces.

**Disposition:** resolved in the working tree after execution: `manual-qa.md` now includes the required directive, separate manifests, supported APIs, socket sequencing and wire/in-memory distinction. No commit SHA exists because committing was prohibited. The script was not modified during execution. Original failed commands/logs remain evidence; the corrected script has not received a separate full QA run.

## Per-scenario log

Timings are approximate bounded run windows including scratch setup retries, not benchmark measurements. Scenarios 1 and 3 ran concurrently; 2 and 4 followed 1; 5 followed emitted artifacts and overlapped the last storage pass. No shared DB state was used.

| # | Scenario | Isolation | Run window | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | PostgreSQL authoring/emission and waiver | tmpdir | Within 15:47–15:54 | Pass after setup corrections | `author.mjs`, `scenario-1/final.log`, generated pair |
| 2 | PostgreSQL real storage/runtime | tmpdir | Within 15:54–16:00 | Pass after setup corrections | `storage.mjs`, `scenario-2/verified.log` |
| 3 | Mongo authoring/validator/live writes | tmpdir | Within 15:47–15:57 | **Fail: F-2** | `mongo.mjs`, `mongo-live.mjs`, `scenario-3/authoring.log`, `scenario-3/live.log` |
| 4 | Extension serializer/wire migration | tmpdir | Within 15:54–15:56 | Pass after correcting wire oracle | `extension.mjs`, `scenario-4/run.log` |
| 5 | Exploratory type/null ergonomics | tmpdir | Approximately 15:57–16:00:31, under 10 minutes | Pass feature probes; F-3 docs finding | `types.ts`, `negative.ts`, `scenario-5/*.log` |

## PostgreSQL evidence

Commands (cwd is the evidence root):

```bash
node author.mjs > scenario-1/final.log 2>&1
node storage.mjs > scenario-2/verified.log 2>&1
node extension.mjs > scenario-4/run.log 2>&1
```

All three final commands exited 0. Generated JSON retains both nullability axes and only `waived` has `noCheck: ['elementNotNull']`. Generated types keep `waived` as `ReadonlyArray<string>`, independent of database enforcement. Nullable-element fields have no automatic waiver. The bad nullable-element waiver was rejected with `PSL_INVALID_ATTRIBUTE_ARGUMENT`: `Field "Note.waived" @noCheck(elementNotNull) does not apply — element-non-null checks are derived only for lists whose elements are semantically non-null`. The envelope is at the end of `scenario-1/final.log`.

Real initialized PGlite catalog:

```text
CATALOG [{"conname":"Note_container_elem_not_null_e87564d7","definition":"CHECK ((array_position(container, NULL::text) IS NULL))"},{"conname":"Note_pkey","definition":"PRIMARY KEY (id)"},{"conname":"Note_strict_elem_not_null_6f8a3c87","definition":"CHECK ((array_position(strict, NULL::text) IS NULL))"}]
```

Public ORM and hostile independent writer:

```text
INSERT {"both":[null,"two"],"container":null,"elements":["one",null,"null"],"id":1,"strict":["hello"],"waived":[]}
READ [{"id":1,"strict":["hello"],"elements":["one",null,"null"],"container":null,"both":[null,"two"],"waived":[]}]
REJECT strict ARRAY[NULL]::text[] 23514 new row for relation "Note" violates check constraint "Note_strict_elem_not_null_6f8a3c87"
REJECT container ARRAY[NULL]::text[] 23514 new row for relation "Note" violates check constraint "Note_container_elem_not_null_e87564d7"
REJECT strict NULL 23502 null value in column "strict" of relation "Note" violates not-null constraint
REJECT elements NULL 23502 null value in column "elements" of relation "Note" violates not-null constraint
REJECT waived NULL 23502 null value in column "waived" of relation "Note" violates not-null constraint
WAIVER_SQL_NULL [{"element_is_null":true,"container_is_null":true,"empty_length":0}]
CLOSED
```

`schemaVerify` returned `ok: true`, `summary: 'Database schema satisfies contract'`, `issues: []` and no warnings. It ran after schema creation and before application writes; no post-write verification or migration transitions are claimed. The PGlite direct array decoder printed waived NULL as the string `"NULL"`; the independent SQL predicate `waived[1] IS NULL` is the reliable storage observation. Normal nullable-list application runtime decoding returned actual JS nulls as shown above. No marker checks were disabled.

## Extension author evidence

Public `PostgresContractSerializer` accepts omitted scalar domain cardinality and hydrates it to `many: false`; native storage scalar is also hydrated to false. List descriptors retain their nested boolean.

```text
REJECTED legacy-domain-list CONTRACT.VALIDATION_FAILED Contract structural validation failed: domain.namespaces.public.models.Note.fields.strict.many must be false (was true)
REJECTED sibling-elementNullable CONTRACT.VALIDATION_FAILED Contract structural validation failed: domain.namespaces.public.models.Note.fields.strict.elementNullable must be removed
REJECTED descriptor-missing-boolean CONTRACT.VALIDATION_FAILED Contract structural validation failed: domain.namespaces.public.models.Note.fields.strict.many.elementNullable must be boolean (was missing)
```

Legacy storage `many: true` also returned `CONTRACT.VALIDATION_FAILED`, naming `columns.strict.many`; its verbose full storage dump is preserved in `scenario-4/run.log`. This was an intentionally mutated fresh artifact, **not a historical snapshot from an older release**. Deliberate wire rejection was tested, archival compatibility was not.

## Exploratory type evidence

Commands:

```bash
pnpm typecheck > scenario-5/positive-final.log 2>&1
pnpm typecheck negative.ts > scenario-5/negative.log 2>&1
node -e "import('./types.ts').then(m=>console.log('SQL_TS_DOMAIN',JSON.stringify(m.contract.domain),'MONGO_TS_DOMAIN',JSON.stringify(m.mongoContract.domain)))" > scenario-5/no-emit.log 2>&1
```

Positive compilation and runtime construction exited 0. Negative compilation exited 2 with exactly eight planted errors: SQL strict element, SQL required container, waived SQL element, Mongo strict element, Mongo required container, missing in-memory storage cardinality, widened Mongo boolean option, widened SQL boolean option. No error-suppression comments were used.

```text
negative.ts(6,57): error TS2322: Type 'null' is not assignable to type 'string'.
negative.ts(7,14): error TS2322: Type 'null' is not assignable to type 'readonly (string | null)[]'.
negative.ts(8,57): error TS2322: Type 'null' is not assignable to type 'string'.
negative.ts(9,66): error TS2322: Type 'null' is not assignable to type 'string'.
negative.ts(10,14): error TS2322: Type 'null' is not assignable to type 'readonly (string | null)[]'.
negative.ts(11,14): error TS2741: Property 'many' is missing in type '{}' but required in type 'Pick<StorageColumn, "many">'.
negative.ts(13,22): error TS2769: No overload matches this call.
negative.ts(14,120): error TS2769: No overload matches this call.
```

SQL `typeof contract` feeds the public application's typed `.create()` with all four matrix values. SQL and Mongo TS-authored domain descriptors were constructed at runtime and match the PSL matrix; generated result types accept the expected four cells. A separate Mongo ORM no-emit result-type proof and Mongo ORM runtime round-trip were not attempted; Mongo execution here is the real driver against the emitted validator. Further charter ideas: more codecs, defaults containing null, enum-member nulls, and migration transitions; these were not explored.

## Coverage outcome

| DoD bullet | Result for this manual run | Boundary |
| --- | --- | --- |
| D1 | N/A | Independent audit / supplied CI |
| D2 | Pass scoped | Fresh SQL/Mongo authoring/emission; no formatter rerun |
| D3 | Pass scoped | Nested descriptors, normalization, explicit waiver, old-shape rejection, required in-memory storage property |
| D4 | Pass scoped | Generated result types and SQL no-emit typed writes; Mongo no-emit construction rather than dedicated inferred result proof |
| D5 | Pass | Public SQL/Mongo builders construct the matrix and reject widened booleans |
| D6 | Pass scoped | Fresh actual PostgreSQL checks and verification; historical transitions not rerun |
| D7 | Pass | PostgreSQL ORM writes/reads actual null elements |
| D8 | **Fail** | Nullable Mongo elements pass; nullable containers fail live validator; Mongo ORM path not exercised |
| D9 | Finding F-3 | Independent ADR audit still owned by orchestrator |

## Disposition map

| Finding | Severity | Proposed disposition | Required next step |
| --- | --- | --- | --- |
| F-2 | High | fix-in-PR | Owner to dispatch Mongo validator/type semantics correction or explicitly resolve scope; rerun container-null probes before close-out |
| F-3 | Follow-up | fix-in-PR | Owner to correct ADR 248 `.nullable()` example to the supported `.optional()` API |
| F-1 | Follow-up | resolved in working tree, no commit permitted | Post-run script revision incorporates prerequisites and cardinality distinction; original logs retained; no separate rerun claimed |

No finding is silently accepted, and no ticket was created on the user's behalf. The overall verdict remains Fail because F-2/F-3 require changes outside this dispatch.

## Cleanup, scope, and environment limits

All final database programs printed `CLOSED`; databases were ephemeral. Scratch artifacts remain intentionally for inspection. `git check-ignore wip/nullable-scalar-lists-qa` returned that path. Initial `git status --short` was empty. Final observed status, stored in `final-status.txt`:

```text
 M drive/retro/README.md
?? projects/nullable-scalar-lists/closeout.md
?? projects/nullable-scalar-lists/manual-qa-run.md
?? projects/nullable-scalar-lists/manual-qa.md
?? projects/nullable-scalar-lists/retros.md
?? projects/nullable-scalar-lists/trace.jsonl
```

Only the two manual-QA Markdown files in that status were written by this dispatch; the other files are concurrent orchestrator work and were not modified or reverted. Automated diagnostics also surfaced `noTargetBranches` on `packages/2-sql/4-lanes/relational-core/src/contract-types.ts:160`; that untouched implementation file is outside the explicitly permitted writes and was not changed. No claim is made that its diagnostic was resolved.

Known Prisma 7 NixOS engine-download 404, fixture-copy EACCES and package-install trust-downgrade failures were supplied context, not reproduced here; no bypass was attempted. Public linked dist was sufficient for this run, so these did not block the selected runtime probes. Registry packaging/installability, historical artifacts, formatter coverage, exhaustive codecs/transitions and Mongo ORM execution remain unverified by this manual pass. Mongo memory-server did start successfully in this environment without overrides; it must not be reported blocked.

## Post-fix rerun — 2026-10-01

**F-2: Pass on the fixed working tree.** The original failed run above remains historical evidence. This verification used branch `fix-mongo-nullable-list-containers`, base HEAD `982bca13644e9d7cdd9702c97a10d9d20482efeb`, with uncommitted implementation and regression tests supplied by other agents. Node `v24.21.0`, pnpm `10.27.0`, Linux/NixOS. Verification commands began before 16:18 UTC; the live consumer probe completed at approximately 16:32 UTC. This is a scoped Mongo rerun, not a new execution of all five original scenarios or a disposition of F-3.

### Automated verification

All commands used repository scripts and existing dependencies. `pnpm build` completed first, refreshing public dist before subsequent checks.

| Command | Observed result | Evidence |
| --- | --- | --- |
| `pnpm build` | 87/87 tasks passed, no cached tasks | `/tmp/mongo-null-fix-build.log` |
| `pnpm typecheck --continue --concurrency=4` | 170/171 tasks passed; only `prisma7-adoption#typecheck` failed downloading the NixOS Prisma 7 engine checksum (404) | `/tmp/mongo-null-fix-typecheck.log` |
| `pnpm lint --continue --concurrency=4` | 102/102 tasks passed; existing warnings remain | `/tmp/mongo-null-fix-lint.log` |
| `pnpm --filter @internal/mongo-contract-psl --filter @internal/mongo test` | 302/302 tests in 16 files plus 154/154 tests in 14 files passed | `/tmp/mongo-null-fix-unit.log` |
| `pnpm --filter integration-tests test test/mongo` | 712/712 reported tests in 112 reported files passed, no type errors | `/tmp/mongo-null-fix-integration.log` |
| `pnpm --filter integration-tests test test/mongo/target-runner/runner-nullable-lists.test.ts --project integration` | 56/56 regression cases passed, one file, no type errors | `/tmp/mongo-null-fix-regression-integration.log` |
| `pnpm lint:deps` | No dependency violations: 2,226 modules, 3,767 dependencies; remaining import checks passed | `/tmp/mongo-null-fix-deps.log` |
| `pnpm fixtures:check` | Failed on retail-store contract validator/hash drift; its emission and migration regeneration stages completed | `/tmp/mongo-null-fix-fixtures.log` |
| `git diff --check` | Passed | Command output was empty |

The unqualified focused regression command also passed, reporting 112 tests in two files (`/tmp/mongo-null-fix-regression.log`). The explicit `--project integration` rerun establishes the requested 56 distinct cases without counting both configured projects. The supplied pre-rebuild evidence was 52 passes and four explicit-null scalar/value-object failures; this verifier did not repeat that RED run.

Typecheck's exact blocking download was `https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/linux-nixos/schema-engine.gz.sha256`, returning `404 Not Found`. No engine override, checksum bypass, dependency installation or source fix was attempted.

### Fresh public-consumer evidence

From `wip/nullable-scalar-lists-qa/`, reran `node mongo.mjs` against rebuilt public exports, then `node mongo-live.mjs` against a real Mongo memory server. Original `scenario-3/live.log`, `scenario-3/authoring.log` and other failed-run logs remain untouched. The old generated pair was copied to `scenario-3/generated-pre-fix/` before re-emission; the old nonasserting probe was preserved as `mongo-live-pre-fix.mjs`. The scratch live probe now asserts rejection code, matched/modified update counts, and the complete stored document, so incorrect acceptance/rejection fails the process rather than merely printing output.

New evidence: `scenario-3/post-fix-authoring.log`, `scenario-3/post-fix-live.log`, `/tmp/mongo-null-fix-qa-emit.log`, `/tmp/mongo-null-fix-qa-live.log`. Fresh PSL contract storage hash: `16bc576d625860653b4c13c480efc1afaef17c95cfcddae84dd04f3e88cfd025`. Emitted `both` and `container` schemas now have `bsonType: ['null', 'array']`; `both.items` admits null/string while `container.items` remains string-only. Required `strict` and `elements` containers remain `bsonType: 'array'`.

```text
REJECTED strict [ null ] 121
ACCEPTED both null
ACCEPTED container null
VERIFIED {"_id":"6abe8b234b4bd2daad678f95","strict":[],"elements":[null],"both":null,"container":null}
CLOSED
```

The initial document with `elements: [null]` and `both: ['ok', null]` was inserted and read successfully before these updates. Both nullable-container updates matched and modified exactly one document. The rejected strict-item update left `strict: []` intact. Cleanup completed in `finally`. This resolves the observed F-2 mismatch for the public emitted-validator/direct-driver path; this manual probe still does not claim Mongo ORM execution.

### Fixture drift and remaining limits

`fixtures:check` itself writes generated output: it changed retail-store `src/contract.json` and `src/contract.d.ts`, five files across its two latest migration directories, and added snapshots under `41bd5540ea833c009b5eacf6db7d489e88bdd5062554398ba8aa2657fa19d27e/` and `9af6d90aaa4cd03bf7eb2040a1c1b5c1225a2b33883ea3d0552f312f4684f8dc/`. No manual fixture edits or subsequent regeneration were performed. Those script outputs were left unstaged for owner disposition, not silently accepted or reverted. The validator change is nullable `products.embedding`: array-only becomes null-or-array. The head storage hash changes from `bd938b4f8a10c688bd32dc61ec1dd808dcf34e725f08505b39ce365a39c97e1b` to `41bd5540ea833c009b5eacf6db7d489e88bdd5062554398ba8aa2657fa19d27e`; migration hash/reference changes are captured in `/tmp/mongo-null-fix-migration-drift.log`.

A read-only search found the old head hash still in `packages/2-mongo-family/9-family/test/fixtures/migration-contract.json` and its declarations, plus the retained historical snapshot. `mongo-migration.test.ts` derives `END_HASH` from that fixture rather than asserting against freshly emitted retail-store output. This is a potentially stale comparison baseline, not a demonstrated failing assertion; that family package's full tests and exhaustive cross-fixture hash consistency were not part of the requested verification. Historical snapshots were not removed. Fixtures and the environment-blocked typecheck mean repository-wide checks are not all green despite the Mongo behavior passing.

Only this appended report and ignored scratch evidence were manually edited by this verifier. Implementation, test, dependency, ADR and other project changes belong to concurrent agents. No staging, commit, push, GitHub reply or safeguard bypass occurred.

## Final close-out disposition — 2026-10-01

The original failed run and scoped post-fix rerun above are preserved unchanged. This section records merged evidence, not a fresh execution of the script.

- **F-2 resolved:** [PR #30568](https://github.com/prisma/orm/pull/30568) merged as `84b3bb693c395ec21ccf2de97d5db4787c805d03` at 2026-10-01T18:31:49Z. All 27 PR checks passed. The scoped live rerun above accepted nullable containers and nullable elements while strict null elements remained rejected with code 121; merged real-Mongo regressions cover 56 distinct cases.
- **F-3 resolved:** the same PR corrected the public builder examples to `.optional()`. The list ADR is now [ADR 258](../../docs/architecture%20docs/adrs/ADR%20258%20-%20List%20cardinality%20has%20independent%20container%20and%20element%20nullability.md); references to ADR 248 in the historical report identify its former number.
- **F-1 resolved:** the corrected script is retained as evidence of the setup changes, not represented as a separately executed full run.
- **Fixture disposition:** the operator-authorized disposable retail-store regeneration shipped in #30568, with historical snapshots retained. Final fix verification passed fixtures, all 2,309 Mongo-family tests and 55 example tests; remote Type Check passed despite the previously recorded local NixOS limitation. Production consumers retain applied migrations/snapshots and apply a new validator migration.
- **Compatibility boundary:** legacy `many: true` rejection belongs to the intentional #30051 wire migration, not the Mongo validator fix. ADR 258 explicitly records the operator-authorized exception to the historical-artifact compatibility floor. This QA does not establish archival loading compatibility or a universal production snapshot upgrade procedure.

**Final disposition: no unresolved QA findings prevent authorized close-out.** Scope and limits of each original run remain as reported. Both merged PRs' review-thread queries completed pagination with zero unresolved threads. No new database suites or consumer probes were run for this final disposition.
