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
| b | 1 (`ffecde3bde`, `650a4f2d32`) | SATISFIED: no finding; 2 design gaps for the orchestrator |
| b | 2 (`0c7ccebe6d`) | SATISFIED: the ruled JSON default gap is closed, no finding |
| c | 1 (`3190ecd3bd`, `dda8c4e356`, `596626b778`, `ae59f32967`, `190e4c7c28`, `4797502384`, `187c1a572c`, `d8eb478422`) | SATISFIED: 1 low; notes for dispatch f |
| c | 2 (`91e087fc09`) | SATISFIED: S2-c-R1-1 closed, no new finding |
| d | 1 (`dee5832fd2`, `86ce42fb16`) | ANOTHER ROUND NEEDED: 2 should-fix; 1 design gap |
| d | 2 (`02642c08c1`, `54b62a3e30`, `809938fa82`) | SATISFIED: S2-d-R1-1 and S2-d-R1-2 closed, the ruled option built, no new finding |

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

### S2-c-R1-1 (low): a failed `ROLLBACK` hides the error that caused it

- Where: `withTransaction` in `packages/3-targets/6-adapters/postgres/src/core/control-adapter.ts:503-517` and `packages/3-targets/6-adapters/sqlite/src/core/control-adapter.ts:434-448`.
- What is wrong: when `fn` throws and `ROLLBACK` then also throws (a dropped connection), the `ROLLBACK` error propagates and the marker write error that caused it is lost.
- Change: when `ROLLBACK` throws, rethrow the original error (for example with the rollback failure as its `cause`, or by ignoring the rollback failure), with a test on each adapter.

### Dispatch c round 2 status of the round 1 finding

- S2-c-R1-1: closed (`91e087fc09`). When `ROLLBACK` throws, the original error is rethrown with the rollback failure as its `cause` (if it had none). Two tests per adapter; both adapter test files pass (4 and 4).

### S2-d-R1-1 (should-fix): nothing keeps the script's copied hash rules equal to the real ones

- Where: `upgrade-instructions/pending/data-type-in-contract/test/generate-fixtures.ts` and `test/data-type-in-contract.test.ts`.
- What is wrong: the generator computes every `after` hash with the real `recomputePublishedStorageHash` and `computeMigrationHash`, and the test compares the script's output with those trees. That proves the copy equal to the real rules on these fixtures on the day they were generated. No test runs the generator again or recomputes the committed hashes with the real functions. If the real hashing changes, for example during dispatch e or a later fix, the fixtures and the script stay equal to each other and the tests stay green while the script writes hashes the framework no longer computes. The fixtures are small, so they also cover few of the canonicalization rules the copy reproduces (empty-value omission paths, sorted index and check arrays, namespace `kind` removal).
- Change: add a test in a package that can import the internal functions (for example under `test/integration`) that reads every `after` fixture and asserts that the real `recomputePublishedStorageHash` with `sqlContractCanonicalizationHooks` gives each contract's stored hash (its snapshot directory name or `storage.storageHash`), and that `computeMigrationHash` gives each `migration.json`'s `migrationHash`. Dispatch e's proof on the repository's own projects then covers the wider shapes.

### S2-d-R1-2 (should-fix): both instruction files leave out two things the user must know

- Where: `upgrade-instructions/pending/data-type-in-contract/{app,extension}/instructions.md`.
- What is wrong: neither file tells the user to run their formatter afterwards, although the script replaces text in `migration.ts` and `contract.d.ts`, so line wrapping can differ from a fresh emit. Neither file says that the script rewrites every `*.json` under the root that parses as a SQL contract (skipping `node_modules`, `.git`, `dist` and `build`), so a test fixture of an old contract kept on purpose is rewritten too.
- Change: add both to each file: commit first; run the formatter after the script; restore any old-format fixture that must stay old with git (or keep such fixtures outside the project root). The design text of 10.2 (`db sign`, extension release order, the `$1::int4` change) is dispatch f's.

### Dispatch d round 2 status of the round 1 findings

- S2-d-R1-1: closed (`02642c08c1`). `test/integration/test/upgrade-instructions/data-type-in-contract-hashes.test.ts` checks every `after` contract with the real `createSnapshotContentVerifier(sqlContractCanonicalizationHooks)`, which recomputes with `recomputePublishedStorageHash` and throws on any difference, and every `migration.json` with the real `computeMigrationHash`. A corrupted stored hash therefore fails it, and a separate test fails when the fixture set holds no contract or no migration.
- S2-d-R1-2: closed (`809938fa82`). Both files say to commit first, that every SQL contract JSON under the root is rewritten (with the skipped directories), how to keep an old fixture, and to run the formatter afterwards.

## Round notes

### Dispatch d, round 2

The ruled `--data-type <codec id>=<data type id>` option (`54b62a3e30`): a value whose codec the table knows on any target is refused (`the script already maps …`), and the table is spread after the extra entries, so it would win anyway. A malformed value, an unknown option and an unknown codec all exit 1 before any file is written; the tests assert the whole tree unchanged for each. The stop line now names the option. Both script copies are byte-identical, as the test asserts. The two `instructions.md` files differ only where the audience differs: the extension file tells the author to publish the `--data-type` lines for their own codecs. Checks: the script's test file, 24 pass; the new integration test file passes. I touched nothing but this file; another implementer was working in the tree.

### Dispatch d, round 1

Steps 1 to 9 of design 10.1 against the script:

1. Every `*.json` under the root (skipping `node_modules`, `.git`, `dist`, `build`) whose `targetFamily` is `sql` is a contract, including the copies under `migrations/<extension>/`; a Mongo contract is left alone (tested).
2. The old hash is the snapshot directory name or `storage.storageHash`, recomputed from content; a mismatch prints the design's line and the file is still rewritten (`stale-hash` fixture).
3. The table is keyed by target. I checked every entry against the built registries: each Postgres and SQLite codec maps to its descriptor's `dataType`; `pg/vector@1`, `pg/geometry@1` and `arktype/json@1` match their extensions' sources; the five retired ids are present. An unknown codec stops (tested).
4. `nativeType` becomes `dataType`; `extensions.*.types.storage[].nativeType` is removed; the SQLite default rules match `slices/2/briefs/s2b-default-rewrites.md` (JSON to canonical text with `null` kept, integer numbers to digit text, digit text unchanged).
5. and 6. Hashes are recomputed with the copied rules (S2-d-R1-1); snapshot directories are renamed, a collision with different content stops, an identical one is merged (both tested); `from`, `to` and `migrationHash` in each `migration.json` and the hashes in ref files go through the map.
7. `snapshots/<hash>/` specifiers in `migration.ts` go through the map.
8. In `contract.d.ts`, each `readonly nativeType` line becomes the `dataType` line for its column's codec, a `nativeType` line inside an extension `types.storage` entry is deleted, hash literals go through the map, and a rewritten default's `DefaultLiteralValue` argument is replaced.
9. An emitted contract keeps its own final newline (amended design); a snapshot is one canonical line plus a newline. On a stop, nothing is written, one line per case goes to stderr, and the exit code is 1.

The choices:

1. The copied hash rules: acceptable, because the script must run in a project that cannot import internal packages. The proof is weak, see S2-d-R1-1.
2. Deleting the extension `nativeType` lines in `contract.d.ts`: right. The emitter writes `extensions` with `serializeValue` of the contract's own `extensions` object (`generate-contract-dts.ts:225`), and that object no longer carries `nativeType`.
3. Any SQL contract JSON is rewritten: this can rewrite a fixture kept old on purpose. In this repository, dispatch e runs the script on `examples/`, `apps/` and `packages/3-extensions/` only, and no JSON file there other than `contract.json` holds `nativeType`, so `test/integration/test/fixtures/contract-format/supabase-before-dbgenerated-removal.contract.json` is out of reach. For users, the instruction text must say it (S2-d-R1-2). An exclusion option is not needed if the text says to keep such files outside the root or restore them with git.
4. The formatter is not mentioned in either `instructions.md` (S2-d-R1-2).
5. Idempotency: each `after` tree run again is unchanged with exit 0, and a second run over an upgraded copy is unchanged. The stop cases assert the whole tree equals `before`, with exit 1 and the exact stderr. Each would fail if the script wrote before stopping or printed otherwise.
6. Unknown codec: design gap for the orchestrator. Design 10.1 step 3 only stops. A project that uses any codec outside the table (a third-party extension, or one of the user's own) cannot upgrade at all, and the stop message gives no way forward. I recommend the inventory's repeatable `--data-type <codec>=<id>` option, with the stop message naming it.

SQL data transforms are stored as lowered SQL in `ops.json`, so no SQL `ops.json` holds a storage hash; the one `ops.json` in the repository with a hash is Mongo (`examples/retail-store`), which the script skips.

Checks: `node --test` on the script's test file: 18 pass. `lint:deps`, `lint:agent` and `check:upgrade-coverage --mode pr --prev bot/data-types-completion` pass. The working tree held uncommitted dispatch e changes while I ran `lint:agent`; I did not touch them.

### Dispatch c, round 1

Design 8: `executeDbSign` loads the aggregate with `buildContractSpaceAggregate`, verifies every space with `strict: false` through `verifyMigration`, and passes the spaces that verified to `familyInstance.signSpaces` in one call. On SQL, `signSpaces` runs the marker bootstrap and every space's read, insert or compare-and-swap update inside one `withTransaction`. The CLI writes refs only after `client.dbSign` returns, so after commit. The app ref goes through `advanceRefSafely`, which writes its snapshot; an extension space's snapshot is already in the store, so only its ref file is written. A failed space keeps its marker, the others are signed, the command exits 4, and each space is named with `signed`, `unchanged` or `failed`.

The checks asked for:

1. Atomicity: `control-instance.sign-spaces.test.ts` "rolls back every marker write when one space loses the compare-and-swap" updates the app marker, fails on the extension's, and asserts `ROLLBACK` and both old markers. Its adapter is a fake whose transaction restores the table; real rollback is covered by the SQLite adapter test on an in-memory database. Refs are written after commit, as above.
2. `withTransaction`: `BEGIN`, `COMMIT` on success, `ROLLBACK` and rethrow on error, on both adapters. The control drivers hold one connection (`PostgresControlDriver` wraps one `pg` `Client`), and the migration runners already issue `BEGIN` on the same drivers. Nothing opens a transaction around `signSpaces`, so there is no nesting. S2-c-R1-1 is the one gap.
3. Output: the JSON document is now `{ ok, summary, spaces[], advancedRefs[] }`, one outcome per space. The previous single-space shape (`marker`, `contract`, `target` at the top level) is gone. This changes what a script reading `db sign --json` sees, so dispatch f's app-audience upgrade text must describe it. The human output is a header, a tree with one line per space, a summary, and one line per advanced ref. It returns diagnostics through `ctx.present` with exit code 4, which is how `db verify` reports drift, and structured errors through `notOk`, as `cli-error-handling.mdc` asks. One `CONTRACT.SCHEMA_VERIFICATION_FAILED` diagnostic per failed space, with `space` in meta; the error reference says so.
4. Choices: extension spaces get a ref file with empty invariants, and `--advance-ref <name>` names that ref in every signed space. That is fine, because design 8.1 says each signed space's `db` ref advances. Unchanged spaces advance their refs too: fine, as the ref then names the contract the database was just verified against, and the command stays idempotent. Mongo: `signSpaces` is a required member of the framework's `ControlFamilyInstance`, so Mongo must implement it. Signing space by space without a transaction is acceptable, because design 8 asks for a transaction only on Postgres and SQLite, and Mongo transactions need a replica set. The design should say so. The PGlite journey uses the test contract-space extension instead of pgvector. This is acceptable for now, because pgvector's committed contract space is in the old format and is refused until dispatch e regenerates it. Dispatch e can switch the journey to pgvector.
5. The `migrate` refusal's fix line and next action use the same words as `migration status` (`status-findings.ts:45,58`): "to overwrite the marker if the database already matches the contract".
6. The Mongo `signSpaces` test can fail: with the loop cut to the first space, it fails.

Checks: the 16 touched test files pass alone (the two `cli-journeys` files through `test:journeys`), including the three PGlite and SQLite journeys and the Mongo `db sign` end-to-end tests. Typecheck passes for framework-components, family-sql, family-mongo, adapter-postgres, adapter-sqlite and cli. `lint:deps`, `lint:agent` and `check:error-reference` pass.

### Dispatch b, round 2

`0c7ccebe6d` builds amended design 9.6. `diffSqliteSchema` decodes a reported literal default of a `sqlite/json@1` column through the codec and writes it back with `encodeJson` before comparing, so another key order or spacing is not drift and a different document still is. Text the codec cannot decode is left as reported. Only verify calls `diffSqliteSchema` (`verifySqliteDatabaseSchema`, `control-target.ts`); the planner builds its own diff, which the commit does not touch. Red first: with the commit's `diff-database-schema.ts` reverted and the target rebuilt, `data-type-verify.test.ts` fails 1 of 4; with it, all 4 pass. `lint:agent` passes.

### Dispatch b, round 1

Design 9 items: the target declares exactly the six data types, each with one written and catalog text; `sqlite/json`, `sqlite/datetime` and `sqlite/bigint` are gone from `packages/2-sql` and `packages/3-targets`. The codec-to-data-type table of 9.2 is built. `sqlite/integer@1`, `sql/int@1`, `sqlite/bigint@1` and `sqlite/bigintnumber@1` read and write digit text; `sqlite/json@1` writes `canonicalizeJson` of the document and reads JSON text; `sqlite/real` casts from `sqlite/integer`; blob and both character types cast from text. No SQLite constructor carries `inferred`. `data-type-verify.test.ts` plans, introspects and verifies one column of each of the six types, and a second test verifies integer and JSON defaults written in their earlier stored form.

The four choices:

1. `tagEntryKey('json')` and `CONTRACT.DATA_TYPE_ENTRY_KEY_INVALID`: fine. Authoring entries are a record keyed by data type id. Postgres never needs a second key, because no Postgres type has both a tag and a plain form (the `json` tag yields `pg/jsonb`, which has no plain entry). On SQLite the `json` tag and the plain string both yield `sqlite/text`, so one of them needs another key. A `tag:` prefix cannot collide with an `owner/name` id. A misfiled entry is a pack author's error found at assembly, like `CONTRACT.DATA_TYPE_ENTRY_DUPLICATE`, so a code of its own fits the existing checks. It is documented, and `check:error-reference` lists 361 codes. The design is silent; record it in design 9.4.
2. JSON key order: not a must-fix. The only comparison between a database default and the contract is verify (`literalValuesEqual`), and the database default was written by the planner from the contract's own canonical text, so the two are equal. Runtime `encode` writes rows, never defaults, and the projection is read back through `decodeJson`, which parses the text. Earlier stored defaults were sorted too, because contract canonicalization sorts every object key. Design gap: verify now compares a SQLite JSON default as two strings, where before it compared documents. A default written outside the planner (hand-written SQL with other key order or spacing) now shows drift. Slice 3's comparison should take the codec into account.
3. `DEFAULT 42` instead of `DEFAULT '42'`: no committed SQLite migration exists, and the three SQLite goldens contain only `DEFAULT 'unnamed'` and `DEFAULT (datetime('now'))`, so nothing committed changes. It does fall outside spec requirement 2. "Contract impact" allows the stored form to change, not the DDL, and the only DDL exception is the `typeRef` fix. Under `INTEGER` affinity both forms store 42, and an existing database still verifies. This is a design gap: `sqlite/integer@1` defaults were already written `DEFAULT 42`, and `sqlite/bigint@1` ones `DEFAULT '42'`, so one of them must change once both store digit text. I recommend accepting `DEFAULT 42` and adding the exception to spec requirement 2.
4. Blob hex: fine. Today's `encodeJson` writes uppercase hex (`codecs.ts:443` at `4031ad07ed`), so "as today" holds and the design's "base64" is the error.

Default rewrites (`wip/s2b-default-rewrites.md`) match the built codecs: JSON to `canonicalizeJson` with `null` kept; integer numbers to digit text; digit text unchanged; other codecs unchanged. The claim that no committed SQLite contract has a JSON, datetime or integer literal default is true: the only two are `sqlite/text@1` `"unnamed"`.

Tests written after the code can fail. I removed the `DATA_TYPE_ENTRY_KEY_INVALID` check and 3 assembly tests failed. The `default-mapping` test fails against the code before this dispatch, which threw on `dataTypeId('tag:json')`. The adapter verify and DDL tests have red logs (`wip/s2b/adapter-verify-red.log`, `ddl-red.log`).

Checks: the 25 changed test files pass alone (398 tests), the SQLite codec testkit passes (66), typecheck passes for framework-components, adapter-sqlite, family-sql, sql-contract-psl and sqlite-codec-testkit. target-sqlite fails only on the committed `contract.d.ts` files of round 1. `lint:deps` passes. `check:error-reference` passes. Framework vocabulary is 254 at 254.

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
