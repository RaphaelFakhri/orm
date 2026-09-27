# Design notes: data types own column types

Working notes while the design is settled with Will. Evidence for every statement is in [`research.md`](research.md). Each question lists the options, what the code says, and a recommendation. A question moves to "Settled" with Will's answer and the reason; the spec is written only from settled answers.

## The project in one paragraph

[ADR 254](../../docs/architecture%20docs/adrs/ADR%20254%20-%20Data%20types%20and%20casts.md) says a data type owns every fact about its database type, and that a codec only says which data type it represents. Today the name of a column's database type is written or computed in eight places that do not agree (research section 2), type constructors name a codec and a type name but never a data type (section 7), and no function argument goes through the cast rule (section 8). This project makes each data type the one source of its database name, the other names a database may report for it, its parameters and how its name is written with them; makes type constructors name data types; and types function arguments by data type.

## Questions to settle

### Q1. Does `contract.json` stop storing a column's `nativeType`? (settled below)

ADR 254 says yes ("the contract loses a redundant field"). The cost, from research section 3: the storage hash covers `nativeType`, so removing it changes the storage hash of every SQL contract. That hash is each migration's `from` and `to`, each `migrationHash`, each snapshot directory name, and the `core_hash`, `origin_core_hash` and `destination_core_hash` already written into users' databases. Every user's committed migration history and every database marker would need rewriting before GA. The runtime never reads the stored value; planners and verify can compute it from the data type once the data type owns the name.

- **(a) Remove it.** Matches ADR 254. Needs an upgrade that rewrites `migration.json` files and snapshot directories, and a way for databases whose marker and ledger hold old hashes to keep working.
- **(b) Keep it, derived.** Nobody authors it: `contract emit` writes it from the data type and its parameters, and the tools that have the stack check it matches. No hash moves, no upgrade. ADR 254's consequence is amended to "derived, never authored".
- **(c) Remove it and keep old hashes.** Not possible: hashing would then need the stack.

Checked for (b): for every codec in every committed contract, the name a data type would produce equals the stored name on Postgres. One exception on SQLite: `sql/char@1` columns store `character` (`examples/prisma-8-demo-sqlite/src/prisma/contract.json`), but that codec represents `sqlite/text`, whose name would be `text`. Either SQLite registers a separate `sqlite/character` data type, or those contracts' hashes move.

**Recommendation: (b).** Everything else the project wants works without removing the field, and (a) makes every RC user rewrite migration history and database state.

### Q1a. How do databases that recorded old hashes keep working? (settled below)

Each database stores its current storage hash in the marker and, per applied migration, the `migration_hash`, `origin_core_hash` and `destination_core_hash` (`packages/3-targets/6-adapters/postgres/src/core/control-adapter.ts:143-145, 294, 406, 434`). `migrate` looks up the marker's hash as a node of the migration graph (`packages/1-framework/3-tooling/cli/src/control-api/operations/migrate.ts:395-470`), and `migration status` matches ledger rows by `migrationHash` (`migration-status-overlay.ts:56-58`). After the file rewrite, none of the old hashes are in the graph, so every command that reads a database would treat it as unknown. A file-only upgrade script cannot change database rows.

- **(a) Rename map, applied automatically.** The upgrade script writes a map of every old hash to its new hash next to the migrations. Every command that reads a marker or ledger row translates an old hash through the map. Commands that already write to the database (`migrate`, `db sign`, `db update`, `db init`) also rewrite the translated rows in the same transaction. Deploy pipelines need no new step.
- **(b) A one-time database command.** A new command rewrites the marker and ledger rows of one database from the map. Every environment runs it once before its next `migrate`; until then commands fail with a message naming the command.
- **(c) `db sign`.** Resets the marker only. The ledger keeps old hashes, so `migration status` shows every applied migration as not applied.

**Recommendation: (a).**

### Q1b. Does a contract in the old format still load? (settled below)

The loader rejects unknown keys (`packages/2-sql/1-core/contract/src/ir/storage-entry-schemas.ts:37-70`), and a contract's stored hash no longer matches after the field is dropped, which the snapshot check refuses (#30086). The test that loads the Supabase contract from before `dbgenerated` was removed (`test/integration/test/contract-format/`) carries `nativeType`.

- **(a)** Refuse it, with a message that names the upgrade script. Old-format contracts are always rewritten, never read.
- **(b)** Accept it by dropping `nativeType` on load and ignoring its stored hash.

**Recommendation: (a).** A contract whose hash cannot be checked is the failure #30086 exists to prevent.

### Q2. Where do a data type's database name, other names and parameters live?

The repository forbids family words (`nativeType`, `table`, `column`, dialect names) in `packages/1-framework` (research section 10), so these facts cannot be fields of the framework `DataType`.

- **(a)** The framework `DataType` gains a parameter schema, which is not SQL-specific (Mongo's `vector` has a length too). The SQL family defines a SQL data type that adds the database name, the other names, and how the name is written with parameters. Mongo later adds its own extension for BSON names. This follows the repository's three-layer pattern (framework interface, family base, target concrete).
- **(b)** Everything on the SQL family's data type, including parameters.

**Recommendation: (a).**

### Q3. Which name is the data type's name, and which are other names?

Postgres has three names for several types: the stored and rendered one (`int4`, `character varying`, `timestamptz`), the one the codec hook uses for parameter casts (`integer`, `double precision`), and the one `format_type` prints (`integer`, `timestamp(3) with time zone`).

- **(a)** The name is today's stored name, so DDL and hashes do not change. Every other name the database may report is listed as another name. Runtime parameter casts use the name, so SQL text changes from `$1::integer` to `$1::int4`, with the same meaning.
- **(b)** As (a), but parameter casts keep a separate name, which leaves two facts.

**Recommendation: (a).**

### Q4. How does verify compare a column's type?

Today it compares strings exactly after normalising only the database side (research section 6), so `decimal`, `integer` or `varchar` in a contract reports drift, and the ALTER TYPE postcheck compares `timestamptz(3)` with `timestamp(3) with time zone`.

- **(a)** Resolve both sides to a data type and parameters through the names and other names, and compare those. A database type no data type claims falls back to comparing strings. This also absorbs the SQLite `character` case in Q1.
- **(b)** Keep string comparison, only generating the expected string from the data type.

**Recommendation: (a).** It is a behaviour change: some differences that report drift today stop reporting.

### Q5. Database parameters and codec parameters

A column has one `typeParams` object. Most parameters belong to the database type (`precision`, `length`). Some belong only to the codec: `arktype/json@1` stores `expression` and `jsonIr` for its TypeScript type, and the column is plain `jsonb` (research section 5).

- **(a)** Keep one `typeParams` object. The data type declares a schema for the keys it owns and renders only those; a codec may declare more keys. No contract format change.
- **(b)** Split into two fields. Contract format change, hashes move.

**Recommendation: (a).**

### Q6. What does a type constructor name?

Today `output: {codecId, nativeType, typeParams}`. ADR 254 says a constructor "names a data type, maps its arguments onto the type's parameters, and picks the codec".

- **(a)** It names a codec and maps arguments onto parameters. The data type follows from the codec, because every codec names exactly one. `nativeType` is deleted from the template. Assembly checks the codec is registered, which today nothing does outside tests.
- **(b)** It names both, and assembly checks they agree.

Arguments are validated by the data type's parameter schema, which removes the per-constructor minimum and maximum copies.

**Recommendation: (a).** ADR 254's sentence is amended to say the data type follows from the codec.

### Q7. Who registers Postgres and SQLite data types and scalar constructors?

The Postgres and SQLite **adapters** register the data types and the main constructor tables, while the codecs live in the **targets** (research sections 1 and 7). ADR 254 says the pack that owns a database type registers its data type, codecs and constructor together.

- **(a)** Move data types and constructors into the target that holds the codecs. TypeScript column helpers keep their public import paths.
- **(b)** Leave them where they are.

**Recommendation: (a).**

### Q8. `contract infer`'s inverse tables

`postgres-type-map.ts` and `infer-default-codec.ts` restate by hand what the data types and constructors will say. Several constructors can name one data type (`BigInt` and `BigIntNumber` for `pg/int8`), so infer needs to know which one to print.

- **(a)** Derive the tables from data types and constructors. Each data type has exactly one constructor marked as the one `contract infer` prints; the marks are chosen so infer's output does not change for any type it prints today. `vector` and `geometry`, which print `Unsupported(...)` today, start printing `pgvector.Vector(n)` and `postgis.Geometry(srid)`.
- **(b)** Keep the hand tables.

**Recommendation: (a).**

### Q9. Function arguments and the SQL expression literals project

ADR 254 says a function parameter names a data type and an argument is admitted by the cast rule. The SQL expression literals project plans a `dataTypeValue` building block for attribute arguments (TML-3288), and is on hold until #30381 merges. Its design is in another worktree, not on `main`.

- **(a)** This project's function-argument slice runs after TML-3288 lands `dataTypeValue`, and uses it.
- **(b)** This project builds `dataTypeValue` first, to TML-3288's design, and TML-3288 reuses it.

In both: a parameter names a data type (`nanoid`'s size is `pg/int4` on Postgres, `sqlite/integer` on SQLite) plus a limit the function owns (2 to 255, or the values 4 and 7). A value of the wrong type reports the cast error; a value outside the limit reports the function's own message, which the outer `@default` choice must no longer replace with "Expected one of". The Prisma 7 source goes through the same parameters, so `nanoid(1000)` and `uuid(5)` stop being accepted.

**No recommendation yet**; it depends on when #30381 is expected to merge.

### Q10. Other written values that are not function arguments

- Enum block member values are read by `JSON.parse` then the codec's `decodeJson`, which is the "codec reads schema text" pattern ADR 254 retires.
- `@@base(Model, "value")` discriminator values are never checked against the discriminator column's type.
- Policy `permissive` is declared `pg/bool@1` but checked by hand.

**Recommendation:** enum member values and discriminator values in scope, read through the same literal rule; `permissive` out, because it is a policy setting and belongs with the block work in #30381.

### Q11. Mongo

Mongo stores no type name in fields. Its BSON type names come from codec `targetTypes` and are copied into collection validators (research section 9). Mongo has no defaults and no function arguments.

- **(a)** In scope only as far as this project's framework changes force it: if `targetTypes` leaves codec descriptors (Q12), the eleven Mongo data types take their BSON names, and Mongo constructors drop their unused `nativeType`. No Mongo casts, written values or validator changes.
- **(b)** Out entirely, keeping `targetTypes` for Mongo.

**Recommendation: (a).**

### Q12. Removing the duplicate sources

`targetTypes` on codec descriptors, the Postgres codec `nativeType(params)` hook, the `expandNativeType` rendering hooks, pack metadata `types.storage[].nativeType`, the dead `normalizeNativeType` and `typeMetadataRegistry`, and the hand tables in Q8 all restate what the data type will own.

**Recommendation:** delete all of them in this project, so each fact has one source.

### Q13. `types {}` aliases and field presets

TML-3055 plans to retire both in favour of mixins. This project changes the template they lower through.

**Recommendation:** keep both working on the new template; retiring them stays TML-3055's decision.

### Q14. A data type writing its own values into migration SQL (TML-3283)

**Recommendation:** out of scope; this project must not make it harder.

## Settled

### Q1. `contract.json` stops storing a column's `nativeType` (Will, 2026-09-27)

Option (a). The column keeps `codecId` and `typeParams`; its database name is derived from the codec's data type and the parameters wherever it is needed. The same applies to named `storage.types` entries.

**Why:** 8.0 has not shipped, so this is the last point at which the contract format can change without a major version. Leaving a derived copy in the file keeps two sources for one fact forever.

**Accepted cost:** every SQL contract's storage hash changes, and with it every migration's `from`, `to` and `migrationHash`, every snapshot directory name, and the hashes recorded in users' databases. Users get a mechanical upgrade that rewrites their files, so nobody edits hashes by hand.

**Assumes:** the rewrite needs no network and no database, so it can ship as an upgrade-instruction script. A migration hash is a pure function of `migration.json` without its own hash and `ops.json` (`packages/1-framework/3-tooling/migration/src/hash.ts:89-100`), and a storage hash is a pure function of the contract JSON, so both can be recomputed from files alone.

**Follow-up questions this opens:** how databases that recorded the old hashes keep working (Q1a); whether a contract in the old format still loads (Q1b).

### Q1a. Databases are re-signed with `db sign` (Will, 2026-09-27)

After the upgrade script rewrites a project's files, the user runs `db sign` once against every database. `db sign` verifies that the database schema matches the new contract and writes the new storage hash into the marker. There is no hash map and no automatic translation.

**Why:** it reuses a command that exists and does exactly this job; no new mechanism has to be built, tested and later removed.

**Accepted cost:** ledger rows keep the old migration hashes. `migration status` works out pending migrations from the marker (`packages/1-framework/3-tooling/cli/src/control-api/operations/migration-status-overlay.ts:19-54`), so nothing shows as pending, but migrations applied before the upgrade lose their "applied" label. Until a database is re-signed, commands that read its marker find a hash that is not in the migration graph; the upgrade instruction tells users to sign every environment before its next `migrate`.

### Q1b. A contract in the old format is refused (Will, 2026-09-27)

Loading a SQL contract whose columns or `storage.types` entries carry `nativeType` fails like any other invalid contract: the message names the entry that carries the field and says contracts no longer store it. The message does not mention the upgrade script; telling users how to rewrite their files is the upgrade instruction's job, not the loader's. Old-format contracts are rewritten, never read.

**Why:** after the field is dropped, the contract's stored hash no longer matches its content, and accepting it would bypass the snapshot hash check from #30086.

**Consequence:** the test `test/integration/test/contract-format/supabase-before-dbgenerated-removal.test.ts` changes from "the old contract loads" to "the old contract is refused, naming an entry that carries `nativeType`".
