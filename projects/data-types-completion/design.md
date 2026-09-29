# Design: data types own column types

This document is the contract for implementers. Where it and an inventory file disagree, this document wins. Where it is silent, stop and ask; do not choose. Snippets are illustrative until re-verified against the code, as `drive/spec/README.md` requires. Sections 2 to 5 are slice 1 (TML-3386), 6 to 8 slice 2 (TML-3387), 9 to 12 slice 3 (TML-3388), 13 slice 4 (TML-3389).

## 1. Terms

- **Data type**: a database type, registered by id (`pg/int8`). A data type is what the database stores.
- **Codec**: one representation of a data type's values in memory, on the wire and in `contract.json`. Every codec names exactly one data type. Values are the codec's job and never the data type's.
- **Text**: one way a database type is written or reported, possibly with parameters: `timestamp(3) with time zone`.
- **Written text**: the text a migration writes. **Catalog text**: the text the database catalog prints (`format_type` on Postgres, `PRAGMA table_info` on SQLite).
- **Type constructor**: how a schema names a column type: `Numeric(10, 2)`.
- **Claim**: a data type claims a reported type when one of its texts matches it, or when it claims the type's kind.

Overrides of the inventories: there is no "stored as" concept (SQLite is corrected instead, section 11); the resolver receives the kind of a type, not a list of enum names (section 6); `pg/tsquery` gets no type constructor.

## 2. The declaration

### 2.1 Framework

`DataType` in `packages/1-framework/1-core/framework-components/src/shared/data-type.ts` gains one optional field, `params`, an arktype schema of the type's parameters. `DataTypeSpec` gains the same. Nothing else in the framework changes shape. A data type without `params` has none, and any parameter on a column of that type is refused where parameters are validated.

### 2.2 SQL family

New file `packages/2-sql/9-family/src/core/sql-data-type.ts`, exported from the family's control and shared entry points. It defines:

```ts
interface SqlTypeText {
  readonly text: string;          // lower case; `{name}` placeholders
  readonly written?: true;        // a migration writes this text
  readonly catalog?: true;        // the database catalog prints this text
  readonly writtenAs?: string;    // the exact characters a migration writes, when they differ from `text` in letter case only
}

interface SqlDataTypeSpec<Params> extends DataTypeSpec {
  readonly texts?: readonly SqlTypeText[];
  readonly claimsKind?: string;
  readonly normalize?: (params: Params) => Params;
  readonly render?: (params: Params) => string;
  readonly fromReported?: (reported: ReportedSqlType) => Params;
}

interface SqlDataType<Params> extends DataType {
  readonly sql: { texts; claimsKind; normalize; render; fromReported };
}

function sqlDataType<Params>(id: string, spec: SqlDataTypeSpec<Params>): SqlDataType<Params>;
function isSqlDataType(type: DataType): type is SqlDataType<unknown>;
```

Rules, all enforced by `sqlDataType` when called, with an `InternalError` naming the id:

1. A text is lower case, has single spaces, and contains only literal characters and placeholders `{name}`. Every placeholder names a key of `params`. A placeholder matches one or more decimal digits and yields an integer.
2. Texts with the same set of placeholders: at most one is `written`, and at most one is `catalog`. A text may be both.
3. `render` and `fromReported` are allowed only together with `claimsKind`, and then `texts` must be absent.
4. `normalize` must be idempotent; `sqlDataType` does not check this, the per-pack test does (section 5).

### 2.3 Writing a name

`renderSqlTypeName(type, params)` in the same file:

1. Validate `params` against the type's `params` schema. A failure throws the structured error `CONTRACT.TYPE_PARAMS_INVALID` naming the data type and the parameter.
2. If the type has `render`, return `render(params)`.
3. Take the raw parameters, not the normalised ones, and drop only the keys that `normalize` removes (the `length` of the two SQLite character types).
4. Pick the `written` text whose placeholder set equals the remaining keys. None: throw `CONTRACT.TYPE_PARAMS_INVALID` with the message `<id> cannot be written with parameters <keys>; it is written with <list of placeholder sets>`.
5. Replace each placeholder with its value, in `writtenAs` when the text has one.

Because step 3 uses the raw parameters, `Char` with no length writes `character` and `Numeric(10)` writes `numeric(10)`, as today.

`renderSqlCatalogText(type, params)` does the same with the normalised parameters and the `catalog` texts. It is used only for the `ALTER COLUMN TYPE` postcheck (section 7.3).

Lists: the caller appends `[]` to the written name of a column with `many`. SQLite upper-cases the written name, as today.

### 2.4 Parameters: one bound each

The data type's `params` schema is the only place a bound is written. Codec parameter schemas for these keys, type constructor `minimum`/`maximum`, the temporal preset's shared `precision` bound (`timestamp-now-generator.ts:22-28`) and the checks inside the deleted hooks are removed. A codec keeps a schema only for keys the data type does not own (`arktype/json@1`: `expression`, `jsonIr`). A column's `typeParams` is valid when the data type's keys pass the data type's schema and the remaining keys pass the codec's schema; a key neither owns is refused.

| Data types | Parameter | Bound |
| --- | --- | --- |
| `pg/numeric` | `precision`, optional | integer 1 to 1000 |
| `pg/numeric` | `scale`, optional, only with `precision` | integer 0 to 1000 |
| `pg/char`, `pg/varchar` | `length`, optional | integer 1 to 10485760 |
| `pg/bit`, `pg/varbit` | `length`, optional | integer 1 to 83886080 |
| `pg/time`, `pg/timetz`, `pg/timestamp`, `pg/timestamptz`, `pg/interval` | `precision`, optional | integer 0 to 6 |
| `pg/enum` | `typeName`, required | non-empty string |
| `pgvector/vector` | `length`, required | integer 1 to 16000 |
| `postgis/geometry` | `srid`, optional | integer 0 or more |
| `sqlite/character`, `sqlite/character-varying` | `length`, optional | integer 1 or more |
| `mongo/vector` | `length`, optional | integer 1 or more |

### 2.5 Normal forms

| Data type | `normalize` |
| --- | --- |
| `pg/numeric` | a `precision` with no `scale` gains `scale: 0` |
| `pg/char`, `pg/bit` | no `length` becomes `length: 1` |
| `sqlite/character`, `sqlite/character-varying` | `length` is removed |
| every other type | identity |

### 2.6 The declarations

Every text below is complete: no other text is declared. `W` marks written, `C` catalog.

**Postgres target** (`packages/3-targets/3-targets/postgres/src/core/data-types.ts`). Casts and `listCast` stay exactly as they are today.

| Id | Texts |
| --- | --- |
| `pg/text` | `text` W C |
| `pg/int2` | `int2` W; `smallint` C |
| `pg/int4` | `int4` W; `integer` C; `int` |
| `pg/int8` | `int8` W; `bigint` C |
| `pg/float4` | `float4` W; `real` C |
| `pg/float8` | `float8` W; `double precision` C; `float` |
| `pg/bool` | `bool` W; `boolean` C |
| `pg/numeric` | `numeric` W C; `numeric({precision})` W; `numeric({precision},{scale})` W C; `decimal`; `decimal({precision})`; `decimal({precision},{scale})` |
| `pg/json`, `pg/jsonb`, `pg/uuid`, `pg/inet`, `pg/bytea`, `pg/date`, `pg/tsquery` | its own name W C |
| `pg/char` | `character` W; `character({length})` W C; `char`; `char({length})` |
| `pg/varchar` | `character varying` W C; `character varying({length})` W C; `varchar`; `varchar({length})` |
| `pg/bit` | `bit` W; `bit({length})` W C |
| `pg/varbit` | `bit varying` W C; `bit varying({length})` W C; `varbit`; `varbit({length})` |
| `pg/time` | `time` W; `time({precision})` W; `time without time zone` C; `time({precision}) without time zone` C |
| `pg/timetz` | `timetz` W; `timetz({precision})` W; `time with time zone` C; `time({precision}) with time zone` C |
| `pg/timestamp` | `timestamp` W; `timestamp({precision})` W; `timestamp without time zone` C; `timestamp({precision}) without time zone` C |
| `pg/timestamptz` | `timestamptz` W; `timestamptz({precision})` W; `timestamp with time zone` C; `timestamp({precision}) with time zone` C |
| `pg/interval` | `interval` W C; `interval({precision})` W C |
| `pg/text-array` | none: claims nothing, is never written |
| `pg/enum` | none; `claimsKind: 'enum'`; `render` and `fromReported` as in section 6.3 |

`numeric(10)` is reported as `numeric(10,0)`: the catalog text for the normalised parameters `{precision, scale}`. `bpchar` and the quoted text `"char"` are declared by nothing and are unclaimed.

**pgvector**: `pgvector/vector`: `vector({length})` W C. **postgis**: `postgis/geometry`: `geometry` W C; `geometry(geometry,{srid})` W C. The written form keeps today's capitalisation `geometry(Geometry,4326)`: for this one text the declaration gives the written form separately, `writtenAs: 'geometry(Geometry,{srid})'`, an optional field of `SqlTypeText` used only when writing.

**SQLite target**, until slice 3 (section 11 changes this set): `sqlite/text`, `sqlite/json`, `sqlite/datetime`: written `text`; `sqlite/integer`, `sqlite/bigint`: written `integer`; `sqlite/real`: `real`; `sqlite/blob`: `blob`. In slice 1 these seven declare written texts only and no catalog text, so nothing about SQLite is claimed by text before slice 3. `sql/char@1` and `sql/varchar@1` on SQLite keep writing `character` and `character varying` through two data types added in slice 1, `sqlite/character` (`character` W C) and `sqlite/character-varying` (`character varying` W C), each casting from `sqlite/text` unchanged.

**Mongo target**: no SQL declaration. `packages/2-mongo-family` defines `mongoDataType(id, { bsonTypes, params?, casts? })`, where `bsonTypes` is a list of BSON type names that may be empty. The values are today's `targetTypes` of each type's codec (inventory `data-types.md` section 5): `mongo/json` eight names, `mongo/bson` none.

## 3. Who registers, and what is deleted

1. The Postgres and SQLite targets' descriptor metadata register `dataTypes`; the adapters stop. The Postgres and SQLite scalar type constructors move from `packages/3-targets/6-adapters/*/src/core/control-mutation-defaults.ts` to each target's `src/core/authoring.ts`. TypeScript column helpers keep their public import paths; the adapter modules re-export nothing new.
2. Each SQL target exports its data types from a shared-plane entry point `./data-types` (it exists for Postgres since #30350; SQLite gains it), so the runtime plane may import them.
3. Deleted, with every reader moved to the data type: `targetTypes` on `CodecDescriptorTemplate` and all declarations; `targetTypesFor` and `byTargetType`; the Postgres codec hook `nativeType(params)` and `nativeTypeFor`; `controlPlaneHooks[codecId].expandNativeType`, `expandLength`, `expandPrecision`, `expandNumeric`, the pgvector, postgis and arktype-json hooks, `buildNativeTypeExpander`; pack metadata `types.storage[].nativeType`, `StorageTypeMetadata.nativeType`, `buildSqlTypeMetadataRegistry`, `typeMetadataRegistry`; `ControlAdapter.normalizeNativeType`; `deriveAnnotations`' `storageTypes`. The file-level list is `inventory/change-list.md`; every file it marks "reads the derived schema IR" is unchanged.
4. Readers after the change: both planners' `buildColumnTypeSql` call `renderSqlTypeName` with the column's data type, found from its codec; the Postgres planner chooses `SERIAL`, `BIGSERIAL`, `SMALLSERIAL` for data type ids `pg/int4`, `pg/int8`, `pg/int2`; identity values and `renderDefaultLiteral`'s JSON branch test data type ids; the Postgres SQL renderer's parameter casts call `renderSqlTypeName`, so `$1::integer` becomes `$1::int4`; `enum` blocks take their column's data type from the `@@type` codec; the Prisma 7 binding's `literalDefaultForm` tests data type ids; Mongo's `derive-json-schema.ts` reads `bsonTypes`.
5. In slices 1 and 2 the contract still stores `nativeType`. `buildStorageColumn` writes it as the first written text of the codec's data type with no parameters (`int4`, `character varying`, and for `pg/enum` the qualified `typeName`). Every committed contract must come out byte-identical.

## 4. Type constructors and field presets

1. `AuthoringStorageTypeTemplate` loses `nativeType`. A constructor or preset output is `{ codecId, typeParams? }`. `ColumnTypeDescriptor` keeps `nativeType` until slice 3.
2. Arguments keep `name`, `kind`, `optional` and documentation; `minimum` and `maximum` are deleted for arguments mapped onto a data type parameter. Validation of such an argument is validation of the resulting `typeParams` against the data type's schema, reported at the argument with the existing code `PSL_INVALID_ATTRIBUTE_ARGUMENT` and the schema's message.
3. Each constructor gains an optional flag `inferred: true` (section 8).
4. `postgis.Geometry`'s `srid` becomes optional. No other constructor's arguments change.
5. New assembly checks in `enforceDataTypeInvariants`, each an `InternalError` naming the contributor and the id: a type constructor or field preset names a codec that is not registered; a constructor maps an argument onto a key the codec's data type does not declare; two SQL data types in the stack declare texts that match the same reported text (compare texts with every placeholder replaced by one marker) or claim the same kind; a data type with at least one constructor has no constructor marked `inferred`, or has two.

## 5. Tests for slice 1

Per pack, a test that lists every registered data type and asserts its declaration equals the table in 2.6, and fails for a registered type with no entry in the test. Per data type with parameters: every row of inventory `data-types.md` section 1.3 "Written today" as a `renderSqlTypeName` case; every bound in 2.4 at its edges; `normalize` applied twice equals once. Planner tests: the DDL of every example migration is unchanged (`pnpm migrations:regen` leaves `ops.json` files identical). Runtime: a parameter cast test expecting `$1::int4`. Assembly: one test per new check in section 4. `pnpm fixtures:check` shows no change.

## 6. Reading a database type

### 6.1 What introspection hands over

```ts
interface ReportedSqlType {
  readonly text: string;               // the catalog text of the element type
  readonly kind: string | undefined;   // the target's word for the type's kind
  readonly schema: string | undefined;
  readonly name: string | undefined;   // unquoted
}
```

Postgres introspection (`packages/3-targets/6-adapters/postgres/src/core/control-adapter.ts`) reads, per column, from `pg_attribute` joined to `pg_type` and `pg_namespace`: whether the type is an array (`typelem <> 0` and `typcategory = 'A'`), and for the element type (or the type itself) `format_type(oid, atttypmod)`, `typtype`, `nspname`, `typname`. `kind` is `'enum'` for `typtype = 'e'`, `'domain'` for `'d'`, `'composite'` for `'c'`, `'range'` for `'r'`, `'multirange'` for `'m'`, and `undefined` for `'b'`. `many` is the array flag. SQLite hands over `text` from `PRAGMA table_info` and nothing else.

### 6.2 The resolver

`resolveReportedSqlType(reported, dataTypes)` in `packages/2-sql/9-family/src/core/sql-data-type.ts` returns `{ dataType: DataTypeId, typeParams }` or `undefined`.

1. If `reported.kind` is defined: the data type whose `claimsKind` equals it claims the type and `typeParams` is `fromReported(reported)`. No such data type: `undefined`. Texts are not consulted.
2. Otherwise prepare the text: trim; lower-case every character outside double quotes; collapse runs of whitespace to one space; remove spaces after `(` and `,` and before `)`.
3. Match the prepared text against every text of every SQL data type in the stack. A match yields the placeholders' integers. Assembly guarantees at most one match.
4. No match: `undefined`. Otherwise validate the parameters against the type's schema; a failure is `undefined`. Return the id and `normalize(params)`.

The function contains no type name, no target name and no branch on the data type's owner.

### 6.3 Enums

`pg/enum` declares `claimsKind: 'enum'`. `fromReported` returns `{ typeName }`: `name` when `schema` is `public`, otherwise `schema + '.' + name`. `render({ typeName })` splits on the first dot and double-quotes each part, as `quoteQualifiedName` does today. A column in the unbound namespace whose enum type lives outside `public` does not compare equal; this is a documented limit.

## 7. Comparing

### 7.1 Schema IR

`SqlColumnIR` (`packages/2-sql/1-core/schema-ir`) gains `dataType: DataTypeId | undefined` and keeps `typeParams`, now normalised. `nativeType` stays as the text for display and DDL: the reported text on the database side, the written name on the contract side. `resolvedNativeType` and `codecBaseNativeType` are deleted; `codecRef` stays. `contractToSchemaIR` requires the stack: it sets `dataType` from the column's codec and `typeParams` to `normalize` of the data type's keys of the column's `typeParams` (codec-owned keys are not compared). `typeRef` columns resolve through `storage.types` first, as today.

### 7.2 Equality

Two columns have the same type when both `dataType` values are defined and equal, their `typeParams` are equal as canonical JSON, and their `many` flags are equal. Every string comparison of type names in `sql-column-ir.ts:182-195`, the Postgres and SQLite issue planners, and `sqlite/.../operations/tables.ts` becomes this function. A column with `dataType` undefined never equals another. The reported text is shown in the mismatch message.

### 7.3 `ALTER COLUMN TYPE` postcheck

The stored postcheck compares `format_type(...)` with `renderSqlCatalogText(type, params)` plus `[]` for lists. `FORMAT_TYPE_DISPLAY` and `buildExpectedFormatType` are deleted.

### 7.4 Defaults

After TML-3253 the default parsers take a codec. The codec is the contract column's codec when verifying, and when inferring the codec of the constructor marked `inferred` for the resolved data type. This slice replaces TML-3253's lookup through `targetTypes` with that rule and changes nothing else about defaults.

## 8. `contract infer`

1. `inferPslContract` receives the same `SqlPslBuildContext` as `buildPslContract`.
2. For each column: resolve its type (section 6). `undefined`: infer fails with the structured error `INFER.COLUMN_TYPE_UNCLAIMED`, listing every such column as `<schema>.<table>.<column>: <reported text>`, and prints no schema.
3. Otherwise print the constructor marked `inferred` for the data type, with arguments taken from the normalised `typeParams` through the constructor's argument mapping, leaving out trailing arguments whose parameter is absent. `pg/numeric` with `{precision: 10, scale: 0}` prints `Numeric(10)`; `pg/char` with `{length: 1}` prints `Char`. Lists print `[]`. Enums print `pg.enum(Name)` as today.
4. Marks. They reproduce today's output (inventory `type-constructors.md` section 4.3): `pg/text` `String`; `pg/bool` `Boolean`; `pg/int4` `Int`; `pg/int8` `BigInt`; `pg/float8` `Float`; `pg/numeric` `Numeric`; `pg/json` `Json`; `pg/jsonb` `Jsonb`; `pg/bytea` `Bytes`; `pg/int2` `SmallInt`; `pg/float4` `Real`; `pg/char` `Char`; `pg/varchar` `VarChar`; `pg/uuid` `Uuid`; `pg/inet` `Inet`; `pg/date` `Date`; `pg/time` `Time`; `pg/timetz` `Timetz`; `pg/timestamp` `Timestamp`; `pg/timestamptz` `Timestamptz`; `pg/enum` `pg.enum`; `pgvector/vector` `pgvector.Vector`; `postgis/geometry` `postgis.Geometry`; and the new `pg/bit` `Bit`, `pg/varbit` `VarBit`, `pg/interval` `Interval`. `pg/tsquery` and `pg/text-array` have no constructor.
5. New constructors in the Postgres target: `Bit(length?)` codec `pg/bit@1`; `VarBit(length?)` codec `pg/varbit@1`; `Interval(precision?)` codec `pg/interval@1`. Each maps its argument onto the parameter of the same name and has documentation in the form its neighbours use.
6. `Unsupported(...)` is removed from Prisma 8: the six production places and their tests listed in inventory `type-constructors.md` sections 5.1, 5.2 and 5.4. The Prisma 6 and Prisma 7 schema readers keep it (5.3).
7. Deleted: `postgres-type-map.ts` tables `POSTGRES_TO_PSL`, `PRESERVED_NATIVE_TYPES`, `PARAMETERIZED_NATIVE_TYPES`; `infer-default-codec.ts` table `CODEC_ID_BY_INFERRED_TYPE`; `normalizeFormattedType`; `normalizeSchemaNativeType`; `normalizeSqliteNativeType`.

Tests for slice 2: a test-only extension in `test/integration` declares `testext/thing` with a parameter, and one journey creates the type and a column by raw SQL, then introspects, verifies and infers it; a second run without the extension expects the mismatch and the infer failure. Against a real Postgres and a real SQLite: for every row of 2.6, as a single column and as a list, create the column through a planned migration, then verify clean and infer the same PSL. Resolver unit tests: every text in 2.6, with different letter case and spacing; `"char"` and `bpchar` unclaimed; every kind. Reviewers compare with what the database returns, per `drive/calibration`.

## 9. The contract format

1. `StorageColumnInput`, `StorageColumnSchema`, `StorageTypeInstance` and its validator: `nativeType` removed; `dataType: string` required, matching the data type id pattern. The schema keeps rejecting unknown keys, which is what refuses an old contract: the error is the standard `CONTRACT.VALIDATION_FAILED`, and its message for this key is `<path>.nativeType: contracts no longer store a column's database type name; the column names its data type in "dataType"`.
2. `buildStorageColumn` writes the codec's data type id. The contract builder requires a codec lookup. `ColumnTypeDescriptor` becomes `{ codecId, typeParams?, typeRef?, valueSet?, entityRef? }`; the fourth argument of `column()` is deleted; every helper in inventory `type-constructors.md` section 3 drops the field.
3. The validator without a stack compares junction columns by `dataType` and canonical `typeParams`. The value-object check and the check that each column's codec represents its `dataType` move to the target's contract serializer, which has the stack: the first compares the column's codec with the codec of the stack's `valueObjectStorageType` constructor; the second fails with `<path>: codec <codecId> represents <its data type>, not <dataType>`.
4. `contract.d.ts`: the emitter writes `readonly dataType: '<id>'` where it wrote `nativeType`. The JSON Schema `data-contract-sql-v1.json` is regenerated.
5. `extensions.<pack>.types.storage[]` entries lose `nativeType` (`contract-enrichment.ts`).
6. Enum columns: `dataType` is `pg/enum`; `typeParams.typeName` is unchanged; the qualifier hook rewrites only `typeParams.typeName`.

## 10. The upgrade

### 10.1 The script

One script per audience, under `upgrade-instructions/pending/data-type-in-contract/{app,extension}/`, following `skills-contrib/record-upgrade-instructions/SKILL.md`. It takes the project root, needs no database, network or stack, and is idempotent: a project already in the new format is left unchanged and the script exits 0.

Steps, in this order:

1. Find every SQL contract: the emitted `contract.json`, every `migrations/**/snapshots/<hash>/contract.json`, and the extension copies under `migrations/<extension>/`. A contract whose target family is not SQL is skipped.
2. For each, recompute the storage hash from the file's content with the old rules and compare it with the stored one. Any mismatch: report and stop (step 8).
3. For each column and `storage.types` entry, look up the data type id for its `codecId` in the table of inventory `upgrade-rewrite.md` section 3, as corrected by section 11 of this document; the `sql/*` codecs map by the contract's target. Any unknown codec id: report and stop.
4. Replace `nativeType` with `dataType`; remove `extensions.*.types.storage[].nativeType`; apply the SQLite default rewrite of section 11.4.
5. Recompute each contract's storage hash, then profile and execution hashes where the file stores them.
6. Build the map from old to new storage hash. Rename each snapshot directory. In each `migration.json` replace `from` and `to` through the map and recompute `migrationHash`. Replace the hash in each ref file.
7. Rewrite `contract.d.ts` files beside rewritten contracts by replacing each `readonly nativeType: '…'` line with the `dataType` line for that column's codec, and the hash literals through the map.
8. Reporting: on any stop the script changes no file, prints one line per case (`<file>: unknown codec <id>` or `<file>: stored hash does not match content`), and exits 1.

The instruction text tells users to delete `nativeType` from hand-written column descriptors in `contract.ts`, to run the script, then to run `db sign` against every database before its next `migrate`, and that `migration status` no longer labels earlier migrations as applied.

### 10.2 `db sign` and `migrate`

`db sign` verifies and signs every contract space of the aggregate, app first, in one transaction; if any space fails verification it writes nothing and reports that space. The `MIGRATION.MARKER_MISMATCH` refusal of `migrate` adds the fix line that `migration status` already uses for `db sign`.

### 10.3 In the repository

Regeneration order is inventory `upgrade-rewrite.md` section 7. The 46 snapshots whose hash does not recompute are regenerated from their sources. The proof required by the upgrade skill: the script run on `examples/` and `packages/3-extensions/` at the base commit produces the same files as regeneration.

## 11. SQLite's data types

1. The SQLite target declares: `sqlite/text` (`text` W C), `sqlite/integer` (`integer` W C), `sqlite/real` (`real` W C), `sqlite/blob` (`blob` W C), `sqlite/character` (`character` W C), `sqlite/character-varying` (`character varying` W C). `sqlite/json`, `sqlite/datetime` and `sqlite/bigint` are deleted.
2. Codecs: `sqlite/text@1`, `sqlite/json@1`, `sqlite/datetime@1` represent `sqlite/text`; `sqlite/integer@1`, `sqlite/bigint@1`, `sqlite/bigintnumber@1`, `sql/int@1` represent `sqlite/integer`; `sqlite/real@1`, `sql/float@1` represent `sqlite/real`; `sqlite/blob@1` represents `sqlite/blob`; `sql/char@1` and `sql/varchar@1` represent the two character types.
3. Canonical forms: `sqlite/text` a string; `sqlite/integer` digit text; `sqlite/real` a JSON number; `sqlite/blob` base64 text as today. Each codec's `encodeJson` and `decodeJson` produce and read exactly that form: `sqlite/json@1` stores the JSON text of the document; `sqlite/datetime@1` its text; the integer codecs digit text.
4. The upgrade script rewrites SQLite literal defaults to match: a default of a `sqlite/json@1` column becomes `JSON.stringify` of the stored document with no added whitespace; a default of `sqlite/integer@1` or `sql/int@1` that is a JSON number becomes its decimal digits.
5. Written values: the `json` tag on SQLite yields `sqlite/text` with the canonical JSON text; the number classifier yields `sqlite/integer` for a whole number of up to 64 bits, `sqlite/real` for a number with a fraction, and refuses the rest as today. Casts: `sqlite/real` from `sqlite/integer`; `sqlite/blob` and the two character types from `sqlite/text`. A `Json` column given a plain string is refused by the codec (`PSL_INVALID_DEFAULT_LITERAL`), not by a missing cast. A `String` column accepts a `json` literal.
6. SQLite introspection calls the resolver with the declared type text. A column declared by hand as `JSON`, `DATETIME`, `VARCHAR(10)` or `CHARACTER(36)` is unclaimed.

## 12. ADR and docs for slice 3

ADR 254: status Accepted; "Data types" rewritten to the declaration of section 2 and the rule "a data type is what the database stores", replacing the paragraph that begins "Where a database's storage classes are shared"; "Columns and type constructors" states the stored column; "Printing" states the failure on an unclaimed type; "Assembly" gains the checks of section 4; "Not decided here" loses the SQL representation question. ADR 171 is marked superseded. `docs/reference/codec-authoring-guide.md` gains "Declaring a data type" and loses the rendering hook section. `docs/reference/error-reference.md` gains the new codes. `CONTRACT-FIDELITY.md` and package READMEs named in inventory `change-list.md` part (c) are updated.

## 13. Written values outside defaults

Depends on `dataTypeValue` from TML-3367, which must never be a direct arm of `oneOf` and throws when its data type is not registered.

1. **Signatures.** `packages/2-sql/9-family/src/core/default-function-signatures.ts` exports `sqlDefaultFunctionSignatures({ integer: DataTypeId })`, returning the signatures of `autoincrement`, `now`, `ulid`, `uuid`, `cuid`, `nanoid`. Postgres passes `pg/int4`, SQLite `sqlite/integer`. The copies in both adapters are deleted; lowering functions stay where they are.
2. **Parameters.** `uuid(version?)`, `cuid(version)`, `nanoid(size?)` each take one `dataTypeValue` of the integer type, followed by the function's own check on the canonical value: `uuid` 4 or 7; `cuid` 2; `nanoid` 2 to 255. The check's messages: `uuid: version must be 4 or 7, got <n>`; `cuid: version must be 2, got <n>`; `nanoid: size must be between 2 and 255, got <n>`. Code `PSL_INVALID_DEFAULT_FUNCTION_ARGUMENT`, at the argument. The TypeScript helper and the field preset import the same limits from `packages/1-framework/2-authoring/ids`.
3. **Reporting.** In `sql-attribute-specs.ts`, before the `@default` arms are tried: if the value is a call whose name is a registered function, only that function's arm runs and its diagnostics are returned. The existing interception of `dbgenerated` uses the same place. Arity messages say `Default function "nanoid"`, not `Attribute "nanoid"`. The optional-field check gets its own code `PSL_DEFAULT_GENERATOR_ON_OPTIONAL_FIELD`.
4. **Prisma 7 reader.** `lowerFunction` binds arguments through the same signatures; `FUNCTION_ARGUMENT_KEYS` is deleted; failures keep the code `PSL.PRISMA7_UNKNOWN_DEFAULT` with the function's message.
5. **Generators.** `applicableCodecIds` becomes `applicableDataTypes`, passed by each target: text generators `pg/text`, `pg/char`, `pg/varchar` on Postgres and `sqlite/text`, `sqlite/character`, `sqlite/character-varying` on SQLite; the UUID generators add `pg/uuid`. The check compares the column's data type.
6. **Enum member values.** The enum entity factory (SQL and Mongo copies) stops calling `JSON.parse` and `decodeJson` on text. A member value is a written value read through the stack's authoring entries, cast into the enum codec's data type, then validated by the codec, with the diagnostics of a default and the general codes from TML-3367. An `enum` block whose `@@type` codec represents a data type with a required parameter is refused: `PSL_ENUM_TYPE_NEEDS_PARAMETERS`, naming the parameter. Mongo has no authoring entries, so its factory is unchanged in behaviour and is only moved to read the data type where it read `targetTypes`.
7. **Discriminator values.** `@@base(Model, value)` takes a `dataTypeValue` whose data type is the discriminator column's, resolved when the attribute is interpreted. The duplicate check stays.

Tests for slice 4: each message above in Prisma 8 PSL and through the Prisma 7 reader, on Postgres and SQLite; `nanoid(8.5)` reporting the missing cast; `String @default(uuid())` emitting on SQLite; enum member and discriminator values of the wrong type refused at the value; a repository grep finding the numbers 2 and 255 for nanoid in one file.
