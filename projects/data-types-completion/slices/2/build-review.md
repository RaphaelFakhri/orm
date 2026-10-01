# Code review: slice 2 (TML-3388)

Reviewer-maintained. Contract: `projects/data-types-completion/design.md` sections 7 to 10. Plan: `projects/data-types-completion/slices/2/plan.md`.

## Subagent IDs

- Implementer: slice 2 implementer (Opus), dispatch a round 1
- Reviewer: slice 2 reviewer (Opus), persistent, started 2026-09-30 for dispatch a round 1

## Scoreboard

| Dispatch | Round | Verdict |
| --- | --- | --- |
| a | 1 (`fa4cbba1ee`, `c8e638387f`, `8e7eb4f82f`, `e8bd655435`, merge `75b971783e`) | ANOTHER ROUND NEEDED: 1 must-fix, 1 should-fix, 4 low |
| a | 2 (`a99f5b13cd..dc527c4502`) | ANOTHER ROUND NEEDED: S2-a-R1-1 to S2-a-R1-6 closed; 1 new must-fix, 1 new low |
| a | 3 (`feac9e4922`, `daed46c3c2`) | SATISFIED: S2-a-R2-1 and S2-a-R2-2 closed, no new finding |

## Findings log

### S2-a-R1-1 (must-fix): a new bare cast in the contract validator

- Where: `packages/2-sql/1-core/contract/src/validators.ts:539-542` (`validateSqlContractStructure`).
- What is wrong: `(value as { storage?: unknown }).storage` is a new bare `as` in production code. `CLAUDE.md` forbids it.
- Change: `value` is already known to be a non-null object at that point, and `isPlainRecord` is imported in the file. Read the key with `isPlainRecord(value) ? value['storage'] : undefined`.

### S2-a-R1-2 (should-fix): two expected print refusals leave out the new `dataType` meta key

- Where: `test/integration/test/psl-print/every-postgres-contract-roundtrip.integration.test.ts`, the entries for `packages/3-extensions/pgvector/src/contract.json` (`types.vector`) and `test/integration/test/ports/engines/queries/data_types/native/postgres/_fixture/string/generated/contract.json` (`"public"."Child"."bit"`).
- What is wrong: `refuseColumnWithoutPslType` (`packages/3-targets/3-targets/postgres/src/core/psl-print/refusals.ts:61-67`) now puts `{ coordinate, dataType, codecId }` in meta. The test compares `meta` exactly. Commit `8e7eb4f82f` removed `nativeType` from these two entries without adding `dataType`, while the merge `75b971783e` wrote `dataType: 'pg/bit'` in the planner golden entry. The test cannot run until dispatch e regenerates the contracts, and then these two entries fail.
- Change: add `dataType: 'pgvector/vector'` and `dataType: 'pg/bit'` to the two entries. Dispatch e confirms both when the test runs.

### S2-a-R1-3 (low): the builder does not validate the parameters of a `storage.types` entry

- Where: `packages/2-sql/2-authoring/contract-ts/src/build-contract.ts:1665-1672` and `authoring-helper-runtime.ts:54-68`.
- What is wrong: design 7.3 says the builder adds `dataType` and validates the parameters against the codec's `paramsSchema`, throwing `CONTRACT.ARGUMENT_INVALID`. The implementation validates when the `type.*` helper is called (unchanged from slice 1) and the builder only adds `dataType`. A hand-written `types` entry, such as `{ kind: 'codec-instance', codecId: 'pg/vector@1', typeParams: { length: 0 } }`, that no column uses is built without any check. A column that references it is checked by `validateColumnTypeParams` with `CONTRACT.TYPE_PARAMS_INVALID`.
- Change: validate each `documentTypes` entry in `buildSqlContractFromDefinition` against its codec's `paramsSchema` with `CONTRACT.ARGUMENT_INVALID` and the path `types.<name>`, with a test. Or, if the orchestrator rules that the helper is the one validation point, record that in design 7.3.

### S2-a-R1-4 (low): skipping a codec the stack does not know has no test

- Where: `packages/2-sql/9-family/src/core/contract-stack-checks.ts:48-51`, `packages/2-sql/9-family/test/control-instance.deserialize-contract-stack.test.ts`.
- What is wrong: a column or storage type whose codec the stack does not register passes the data type check. No test fixes this, so a later change could start refusing such contracts (or stop skipping them) without a test failing.
- Change: add a test that deserializes a contract with an unregistered codec and expects it to be accepted by this check.

### S2-a-R1-5 (low): test helpers pair columns with data types that do not exist

- Where: the `codecId.replace(/@\d+$/, '')` helpers in `packages/2-sql/9-family/test/contract-to-schema-ir.test.ts:126`, `packages/2-sql/9-family/test/field-event-planner.test.ts:19`, `packages/3-targets/6-adapters/sqlite/test/migrations/planner.codec-field-event.test.ts:18`, `packages/2-sql/5-runtime/test/{codec-integrity,codec-mapping-validation,same-bare-table-name,sql-context.codec-context}.test.ts`, `packages/2-sql/4-lanes/relational-core/test/{codec-descriptor-registry,codec-ref-for-column}.test.ts`, `packages/2-sql/4-lanes/sql-builder/test/runtime/same-bare-table-name.test.ts`, and three `sql-orm-client` tests.
- What is wrong: removing `@N` gives a wrong data type for any codec whose id differs from its data type's: `sql/char@1` becomes `sql/char` (the real one is `pg/char` or `sqlite/character`), `pg/vector@1` becomes `pg/vector` (real: `pgvector/vector`), and likewise `sql/int@1`, `pg/timestamptz-temporal@1` and `arktype/json@1`. `contract-to-schema-ir.test.ts` uses `sql/char@1` and `pg/vector@1` this way. No test relies on the wrong pair today: `contractToSchemaIR` takes the data type from the codec, `isAlteration` returns before comparing `dataType` when the codec differs, and the runtime never reads `dataType`. But these contracts would be refused by `deserializeContract`, so a test that later passes one through it or through the junction check would test invalid data. `createContractTable` in `packages/2-sql/9-family/test/schema-verify.helpers.ts:76-88` is safe: it refuses to guess for the four temporal types, its tests use only `pg/int4`, `pg/text` and `pg/varchar` (whose `@1` codecs represent them), and the `app/enum` entry names its codec.
- Change: take the data type from the codec's descriptor (`descriptor.dataType`) through a shared test lookup, or write the data type id explicitly in each test.

### S2-a-R1-6 (low): two stale sentences

- Where: `packages/3-targets/6-adapters/postgres/src/exports/column-types.ts:4` ("provide both codecId and nativeType"); `packages/3-targets/3-targets/postgres/src/core/codec-helpers.ts:29,51` (`typeName: typeName`, which can be the shorthand `typeName`).
- Change: rewrite the comment to say the descriptors provide the codec id; use the shorthand. `test/utils/README.md:130` still shows `nativeType`; dispatch f's README pass covers it.

### Dispatch a round 2 status of the round 1 findings

- S2-a-R1-1: closed (`a99f5b13cd`, `isPlainRecord`).
- S2-a-R1-2: closed (`c92fb6560f`).
- S2-a-R1-3: closed by ruling (`slices/2/plan.md`: the `type.*` helper is the one validation point).
- S2-a-R1-4: closed (`95dc5e74c4`).
- S2-a-R1-5: closed (`74bd975257`), except the file named in S2-a-R2-2.
- S2-a-R1-6: closed (`dc527c4502`).

### S2-a-R2-1 (must-fix): two new tests do not typecheck

- Where: `packages/3-targets/6-adapters/sqlite/test/descriptor-meta.test.ts:36` (TS18048, `sqliteTargetDescriptor.authoring` is possibly undefined); `packages/3-extensions/sqlite/test/contract-builder/value-object-storage.test.ts:55` (TS2559, the SQLite pack has no properties in common with `CodecContributor` in the call to `assembleSqliteCodecRegistry`).
- What is wrong: both tests pass under vitest, which does not typecheck them, but `@internal/adapter-sqlite#typecheck` and `@internal/sqlite#typecheck` now fail. Neither failure comes from a committed `contract.d.ts`, so the branch tip does not meet the dispatch's typecheck requirement.
- Change: use `authoring?.` in the first test. In the second, pass the target descriptor that `assembleSqliteCodecRegistry` expects, as the Postgres version of the test does. Then run both packages' `typecheck`.

### S2-a-R2-2 (low): one explicit map disagrees with its own test lookup

- Where: `packages/2-sql/9-family/test/contract-to-schema-ir.test.ts:44-53`.
- What is wrong: the file's codec lookup (lines 96-103) says `sql/char@1` represents `test/character`, `pg/text@1` represents `test/text`, and so on. The new map says `pg/char`, `pg/text`, `pgvector/vector`. So every test column pairs a codec with a data type that the test's own stack says it does not represent. No assertion depends on it, because `contractToSchemaIR` takes the data type from the codec.
- Change: delete the map and take `dataType` from `dataTypeOfCodec[codecId].id`.

### Dispatch a round 3 status of the round 2 findings

- S2-a-R2-1: closed (`feac9e4922`). `authoring?.` in the adapter test; the SQLite pack test uses `createSqliteBuiltinCodecLookup()`.
- S2-a-R2-2: closed (`daed46c3c2`). Columns take `dataType` from the test's own codec lookup; the `test/unknown@1` column, which the lookup does not know, names its data type explicitly.

## Round notes

### Dispatch a, round 3

`typecheck` for `@internal/adapter-sqlite`, `@internal/sqlite` and `@internal/family-sql`: all exit 0. The three changed test files pass alone (1, 8 and 43 tests). Both commits carry the two sign-offs and no AI attribution.

### Dispatch a, round 2

The machine was heavily loaded. I rebuilt only the touched packages (sql-contract, sql-contract-ts, target-postgres, target-sqlite, family-sql, both adapters; exit 0).

Value-object storage type: moving `valueObjectStorageType` from the adapters' `control.ts` to the targets' `descriptor-meta.ts` matches design 3.1, which gives the targets the type constructors and the other PSL authoring contributions; `Jsonb` and `Json` are target constructors. The stack still reads it from every descriptor and refuses a second declaration (`control-stack.ts:228-244`). The PSL value-object tests (10), the SQLite adapter descriptor test (8) and the Postgres adapter `control-mutation-defaults` test (19) pass. The builder reads the constructor's codec from `definition.target.authoring`, and `deserializeContract` uses the same refusal text, from `valueObjectStorageTypeMissingMessage` in `validators.ts`.

Explicit maps: the maps are per file, not shared. The only `sql/char@1` and `sql/varchar@1` entries are in Postgres-only files (`contract-to-schema-ir.test.ts`, the runtime `same-bare-table-name.test.ts`), and the one SQLite file (`planner.codec-field-event.test.ts`) maps only `sqlite/text@1` and a test codec. `pg/vector@1` maps to `pgvector/vector`, which is right. The one wrong file is S2-a-R2-2.

Checks: `turbo run typecheck --continue`: 22 tasks fail. 20 are the round 1 list, all committed `contract.d.ts`; `adapter-sqlite` and `sqlite` are new and are S2-a-R2-1. Each touched test file run alone: 20 pass; the two `sql-orm-client` files fail only on the committed fixture contract (expected until dispatch e), and the round-trip integration test was not run (it reads committed contracts). `lint:deps` and `lint:agent` pass.

### Dispatch a, round 1

Brief items against design 7:

1. Done. `StorageColumnSchema` and `StorageTypeInstanceSchema` require `dataType` matching `DATA_TYPE_ID_PATTERN` and keep `'+': 'reject'`. The refusal text is exactly the design's, reported per key with its path, under `CONTRACT.VALIDATION_FAILED` from both `validateStorage` and `validateSqlContractStructure`. It does not mention the upgrade script, and a test asserts that. `test/integration/test/contract-format/supabase-before-dbgenerated-removal.test.ts` passes (4 tests).
2. Done. `buildStorageColumn`, raw `storage.types`, `type.*` helpers and PSL `types {}` aliases all end in `dataType` from `sqlDataTypeOfCodec`. `unquotedSqlBaseName` stays for the schema IR, postcheck and PSL printer.
3. Done, with S2-a-R1-3. `ColumnTypeDescriptor` has no `nativeType`; `column()` takes three arguments; every helper dropped the field; helpers return `{ kind, codecId, typeParams }`.
4. Done. Junction columns compare by `dataType` and `canonicalizeJson` of `typeParams`; the `json`/`jsonb` set is deleted; `assertContractMatchesStack` runs in `deserializeContract` only, not at runtime.
5. Done. The emitter writes `readonly dataType`; the `contract-ts` type declares `readonly dataType: string`. The JSON Schema matches its generator: I reran `pnpm schemas:generate` and the file did not change.
6. Done. `StorageTypeMetadata.nativeType` and every pack's `types.storage[].nativeType` are gone; `contract-enrichment.ts` copies the metadata as it is, so the emitted `extensions` lose the key.
7. Done. `pgEnumDescriptor.columnFromEntity` returns only `typeParams`; the qualifier rewrites only `typeParams.typeName`.
8. Done. `DdlColumnRenderContext.typeText`; `assertSafeNativeType` and `CONTRACT.NATIVE_TYPE_INVALID` have no occurrence outside `projects/`.
9. Done. `ContractView.tsx` shows `column.dataType`, and its test asserts `pg/uuid` and `pg/text` appear.

No committed `contract.json`, `contract.d.ts`, snapshot, migration or planner golden changed; only the golden fixtures' `contract.ts` sources lost `nativeType`. The implementer's red logs (`wip/s2a/sqlc-red.log`, `fam-red.log`, `emit-red.log`) show tests red before the code, although tests and code share commits. No test name uses "should". Commits carry both sign-offs and no AI attribution. The merge `75b971783e` wrote `dataType: 'pg/bit'` in the planner golden refusal, which matches `refusals.ts`.

The implementer's seven choices:

1. Canonical JSON of `typeParams` without a stack: fine. `dataTypeParams` needs the data type's `params`, which only a stack has. Comparing all of `typeParams` is stricter only for codec-owned keys. The design should say this.
2. The check covers `storage.types` and skips an unknown codec: fine. Refusing would break contracts whose pack is not loaded (the golden test's `extensionsNotLoaded` contracts), and the planner already refuses a column whose codec it cannot find. The design should record it; S2-a-R1-4 asks for a test.
3. A value-object column in a stack with no value-object storage type is refused: fine. It follows from design 7.4. The messages name the path, the codec and the constructor.
4. PSL aliases no longer write a type name: fine. One writer is simpler, and PSL tests show `dataType` on the built entries.
5. Value objects on SQLite through TypeScript: not a regression. No test, example or fixture builds one: the 12 committed SQLite contracts have no value object, and `contract-builder.value-objects.test.ts` uses Postgres only. The one SQLite value-object test (`contract-psl/test/interpreter.value-objects.test.ts:390`) is PSL, which uses the stack's `valueObjectStorageType` (`sqlite/json@1`) and still passes. Before this dispatch the builder wrote `pg/jsonb@1` into a SQLite contract, which the SQLite stack could not run. Design gap for the orchestrator: the TypeScript builder hard-codes `pg/jsonb@1`, while `deserializeContract` now requires the stack's value-object storage type codec. The builder should take the codec from `valueObjectStorageType` as PSL does.
6. Renames: fine for the grep check. `DefaultRenderer`'s third argument and `DdlColumnRenderContext.typeText` are exported (`packages/2-sql/9-family/src/exports/control.ts`, relational-core), so the extension-audience upgrade text in dispatch f must name both.
7. Threshold 262 to 254: fine. The count is 254; the halt condition is only a raise.

Checks:

- `pnpm build`: 86 of 87 tasks pass. `prisma-8-postgis-demo#build` fails with 31 errors, all from its committed `contract.d.ts`.
- `test:packages:agent` (`wip/test-packages.20260930-223309.30607.log`): 99 files fail. 96 are expected fixtures: 69 `sql-orm-client` (runtime tests refused at `test/helpers.ts` deserialize, type tests on the committed `contract.d.ts`), 12 `extension-supabase` (committed contract and contract space), 6 `sql-builder` and 1 `postgres` (`raw-lane`) on the committed fixture, `sql-contract-prisma7` `fixtures.test.ts` (35 committed `expected-contract.json`), `target-postgres` `postgres-migration`, `snapshot-read-shapes`, `postgres-contract-view`, `target-sqlite` `sqlite-migration`, `sqlite-contract-view`, and `cli-telemetry` `integration` and `cli-e2e` (committed `apps/telemetry-backend` contract). 3 are environmental: `all-shells-tarball`, `module-identity`, `cross-shell-tarball` fail in `pnpm install`, as in slice 1. No real defect.
- `typecheck:agent` stops at the first failure, so I ran `turbo run typecheck --continue` (`wip/review-s2a/typecheck-continue.log`): 20 tasks fail, all from committed `contract.d.ts` files: `extension-supabase` (including `src/pack/index.ts` and `src/runtime/supabase.ts`, which import the extension's committed `contract.d.ts`), `postgres`, `sql-builder`, `sql-orm-client`, `target-postgres`, `target-sqlite`, `bundle-size`, `e2e-tests`, `integration-tests`, `multi-extension-monorepo`, `paradedb-demo`, `prisma-8-cloudflare-worker`, `prisma-8-demo`, `prisma-8-demo-sqlite`, `prisma-8-postgis-demo` (build and typecheck), `prisma7-adoption`, `react-router-demo`, `supabase-example`, `telemetry-backend`.
- `lint:agent`, `lint:deps`, `check:error-reference` (360 codes), `lint:casts` (delta 0): pass. `lint:framework-vocabulary`: 254 at threshold 254.
- The golden planner test, `fixtures:check` and the Postgres round-trip test read committed contracts and are expected red until dispatch e. I did not run the full integration or e2e suites.
