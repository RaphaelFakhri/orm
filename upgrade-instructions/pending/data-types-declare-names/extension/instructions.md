---
changes:
  - id: sql-data-type-declares-names
    summary: |
      A SQL data type now declares how the database writes and reports it. Declare an extension's
      SQL data types with `sqlDataType(id, { params, texts, ... })` from
      `@internal/sql-contract/data-type` instead of `dataType(id, ...)`. Migrations, schema
      verification and PostgreSQL parameter casts read the column type's name from this
      declaration only.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '(?<![\w$.])dataType\(\s*[''"][a-z0-9-]+/'
  - id: codec-target-types-removed
    summary: |
      `targetTypes` is removed from codec descriptors and templates, with `CodecLookup.targetTypesFor`
      and `CodecDescriptorRegistry.byTargetType`. A SQL codec's type names move to its data type's
      `texts`; a Mongo codec's BSON types move to its data type, declared with
      `mongoDataType(id, { bsonTypes })` from `@internal/mongo-contract`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\btargetTypes\b'
        - '\btargetTypesFor\b'
        - '\bbyTargetType\b'
  - id: native-type-rendering-hooks-removed
    summary: |
      The rendering hooks are removed: `CodecControlHooks.expandNativeType`, the protected
      `nativeType(params)` method of `PostgresCodecDescriptor` and its public `nativeTypeFor(ref)`,
      `NativeTypeExpander`, and the control adapter's `normalizeNativeType`. The data type's
      `texts` write the column type instead.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bexpandNativeType\b'
        - '\bprotected\s+override\s+nativeType\s*\('
        - '\bnativeTypeFor\b'
        - '\bNativeTypeExpander\b'
        - '\bnormalizeNativeType\b'
  - id: postgres-codec-takes-data-type
    summary: |
      `postgresCodec(template, options)` and `sqliteCodec(template, options)` take the data type
      object in `options.dataType`, not its id, and `postgresCodec` no longer takes a `nativeType`
      option. The adapted codec's `paramsSchema` is the data type's `params`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\b(?:postgresCodec|sqliteCodec)\s*\([^;]*?\bdataType\s*:\s*[\w$]+\.id\b'
        - '\bpostgresCodec\s*\([^;]*?\bnativeType\s*:'
  - id: codec-params-schema-is-data-type-params
    summary: |
      A codec's `paramsSchema` is its data type's `params`, referenced and not restated. Move the
      parameter schema and its bounds onto the data type, and point the codec at it.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bparamsSchema\b[^;=]*=\s*(?:arktype|type)\s*\('
        - '\bconst\s+[\w$]*[pP]aramsSchema\s*=\s*(?:arktype|type)\s*\('
  - id: type-constructor-templates-lose-native-type
    summary: |
      A type constructor's or field preset's `output` no longer takes `nativeType`; it is
      `{ codecId, typeParams? }`. An argument mapped onto a data type parameter drops its `minimum`
      and `maximum`, because the data type's `params` checks it. A constructor may set
      `inferred: true`; at most one per data type.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\boutput\s*:\s*\{[^{}]*\bnativeType\s*:'
  - id: runtime-descriptor-registers-data-types
    summary: |
      A SQL runtime extension descriptor lists its `dataTypes`, the same list as its control
      descriptor, and `createPostgresAdapter({ codecDescriptors })` takes the matching `dataTypes`.
      The runtime writes PostgreSQL parameter casts from the data type a codec represents.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bSqlRuntimeExtensionDescriptor\s*<[^>]*>\s*=\s*\{(?=[^;]*\bcodecDescriptors\b)(?![^;]*\bdataTypes\b)'
        - '\bcreatePostgresAdapter\s*\(\s*\{(?=[^}]*\bcodecDescriptors\b)(?![^}]*\bdataTypes\b)'
  - id: contract-build-takes-lookups
    summary: |
      `buildSqlContractFromDefinition` and the `defineContract` of `@internal/sql-contract-ts`
      require `codecLookup` and `dataTypeLookup`. The Postgres and SQLite `defineContract` facades
      build both from the target and `extensions`, so a TypeScript contract that uses an extension's
      codec must list that extension, or pass lookups that hold its codecs and data types.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bbuildSqlContractFromDefinition\s*\('
        - '\bdefineContract\s*\(\s*\{\s*\}'
  - id: contract-to-schema-ir-takes-lookups
    summary: |
      `contractToSchemaIR` options replace `expandNativeType` with the required `dataTypes`
      (a `DataTypeLookup`) and `codecLookup`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bcontractToSchemaIR\s*\('
  - id: data-type-lookup-lists-all
    summary: |
      `DataTypeLookup` gains `all(): readonly DataType[]`, in assembly order. A hand-written lookup
      adds it; `createDataTypeLookup(types)` already provides it.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bimplements\s+(?:[\w.]+\s*,\s*)*DataTypeLookup\b'
        - ':\s*DataTypeLookup\s*=\s*\{'
  - id: validate-scalar-type-codec-ids-removed
    summary: |
      `validateScalarTypeCodecIds` is removed. Stack assembly now refuses, with an `InternalError`,
      a type constructor or field preset that names an unregistered codec, a constructor argument
      mapped onto a parameter neither the data type nor the codec declares, two constructors of one
      data type marked `inferred`, and two SQL data types that claim the same reported type.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bvalidateScalarTypeCodecIds\b'
---

## `sql-data-type-declares-names`

Declare each SQL data type the extension owns with `sqlDataType`, and list the texts the database writes and reports for it. `@internal/sql-contract/data-type` is a new dependency of the package.

```ts
// before
import { type DataType, dataType } from '@internal/framework-components/codec';

export const pgvectorVector: DataType = dataType('pgvector/vector', {
  listCast: { of: [pgInt2.id, pgInt4.id, pgInt8.id, pgNumeric.id], cast: toNumbers },
});

// after
import { sqlDataType } from '@internal/sql-contract/data-type';
import { type as arktype } from 'arktype';

export const pgvectorVectorParams = arktype({
  length: 'number.integer >= 1 & number.integer <= 16000',
});

export const pgvectorVector = sqlDataType('pgvector/vector', {
  params: pgvectorVectorParams,
  texts: [{ text: 'vector({length})', written: true, catalog: true }],
  listCast: { of: [pgInt2.id, pgInt4.id, pgInt8.id, pgNumeric.id], cast: toNumbers },
});
```

Each text is lower case with single spaces, and `{name}` stands for the parameter `name`. Mark the text a migration writes `written: true`, and the text the database catalog prints (`format_type` on PostgreSQL) `catalog: true`. Among texts with the same placeholders, at most one is written and one is catalog. A type written with and without parameters lists a text for each, as `postgis/geometry` does with `geometry` and `geometry(geometry,{srid})`. Use `display` when the database writes the name in a different letter case (`display: 'geometry(Geometry,{srid})'`). Add `normalize` when two parameter sets name the same database type. Keep `casts` and `listCast` as they are. Drop an explicit `: DataType` annotation on the declaration so the parameter type is kept; the list in `dataTypes` stays `readonly DataType[]`.

The texts must reproduce what the removed hooks wrote: the written text for the column's parameters must equal the old `expandNativeType` result, or migration SQL changes.

The section "Declaring a data type" of the Prisma 8 codec authoring guide (`docs/reference/codec-authoring-guide.md` in the Prisma repository) describes every field.

## `codec-target-types-removed`

Delete `targetTypes` from every codec descriptor and template:

```ts
// before
override readonly targetTypes = ['vector'] as const;

// after: the line is gone; the names are the data type's texts
```

Code that read `codecLookup.targetTypesFor(codecId)` or `registry.byTargetType(name)` reads the data type instead: `dataTypes.get(codecLookup.descriptorFor(codecId).dataType)`. For a SQL type, call `sqlBaseName(type, dataTypeParams(type, typeParams))` or `renderSqlTypeName(...)` from `@internal/sql-contract/data-type`. For a Mongo codec, move the list to the data type the codec names and read it with `bsonTypesOfCodec(codecId, { codecLookup, dataTypes })` from `@internal/mongo-contract`:

```ts
export const myDecimal = mongoDataType('my/decimal', { bsonTypes: ['decimal'] });
```

## `native-type-rendering-hooks-removed`

Delete the `nativeType` override from each `PostgresCodecDescriptor` subclass, and delete `expandNativeType` from each entry of `controlPlaneHooks`. If a hooks object is left empty, delete it and its `types.codecTypes.controlPlaneHooks` entry. Keep the other hooks, such as `resolveIdentityValue`.

```ts
// before
export class PgVectorDescriptor extends PostgresCodecDescriptor<VectorParams> {
  protected override nativeType(): string {
    return 'vector';
  }
  // …
}

const vectorControlPlaneHooks: CodecControlHooks = {
  expandNativeType: ({ nativeType, typeParams }) => `${nativeType}(${typeParams?.['length']})`,
  resolveIdentityValue: ({ typeParams }) => buildVectorIdentityValue(typeParams),
};

// after
export class PgVectorDescriptor extends PostgresCodecDescriptor<VectorParams> {
  // …
}

const vectorControlPlaneHooks: CodecControlHooks = {
  resolveIdentityValue: ({ typeParams }) => buildVectorIdentityValue(typeParams),
};
```

A caller of `descriptor.nativeTypeFor(ref)` uses `sqlBaseName` of the codec's data type. A custom control adapter drops `normalizeNativeType`.

## `postgres-codec-takes-data-type`

```ts
// before
const postgresSqlTextDescriptor = postgresCodec(sqlTextDescriptor, {
  dataType: pgText.id,
  nativeType: () => 'text',
  jsonProjection: (expression) => expression,
});

// after
const postgresSqlTextDescriptor = postgresCodec(sqlTextDescriptor, {
  dataType: pgText,
  jsonProjection: (expression) => expression,
});
```

Import the data type object if only its id was imported. `sqliteCodec` changes the same way, without a `nativeType` option to remove.

## `codec-params-schema-is-data-type-params`

Move the schema, with its bounds, onto the data type as `params`, written as an arktype object schema, and set the codec's `paramsSchema` to it:

```ts
// before, in codecs.ts
const vectorParamsSchema = arktype({ length: 'number' }).narrow((params, ctx) =>
  Number.isInteger(params.length) && params.length >= 1 && params.length <= VECTOR_MAX_DIM
    ? true
    : ctx.mustBe(`an integer in the range [1, ${VECTOR_MAX_DIM}]`),
);
override readonly paramsSchema: StandardSchemaV1<VectorParams> = vectorParamsSchema;

// after
import { pgvectorVector, pgvectorVectorParams } from './data-types';
override readonly paramsSchema: StandardSchemaV1<VectorParams> = pgvectorVectorParams;
```

A codec with keys of its own sets `paramsSchema` to `dataType.params.and(ownKeys)`. A codec whose data type has no `params` keeps a schema of its own keys only; `arktype/json@1` is such a codec and changes nothing here.

## `type-constructor-templates-lose-native-type`

```ts
// before
Vector: {
  kind: 'typeConstructor',
  args: [{ kind: 'number', name: 'length', integer: true, minimum: 1, maximum: VECTOR_MAX_DIM }],
  output: {
    codecId: 'pg/vector@1',
    nativeType: 'vector',
    typeParams: { length: { kind: 'arg', index: 0 } },
  },
},

// after
Vector: {
  kind: 'typeConstructor',
  inferred: true,
  args: [{ kind: 'number', name: 'length', integer: true }],
  output: {
    codecId: 'pg/vector@1',
    typeParams: { length: { kind: 'arg', index: 0 } },
  },
},
```

Keep `minimum` and `maximum` on an argument that also feeds something other than a data type parameter. Set `inferred: true` on the one constructor that `contract infer` should print for the data type.

## `runtime-descriptor-registers-data-types`

```ts
const pgvectorRuntimeDescriptor: SqlRuntimeExtensionDescriptor<'postgres'> = {
  kind: 'extension' as const,
  id: pgvectorPackMeta.id,
  version: pgvectorPackMeta.version,
  dataTypes: pgvectorPackMeta.dataTypes,
  // …
};
```

Without it, a query that binds a parameter of the extension's codec fails when the SQL is rendered, because the runtime stack has no data type to write the cast from. When building an adapter by hand, pass the same list: `createPostgresAdapter({ codecDescriptors, dataTypes: pgvectorDataTypes })`. An extension whose codecs represent only the target's data types, such as `arktype/json@1` over `pg/jsonb`, has no data types of its own and adds nothing.

## `contract-build-takes-lookups`

The column's stored `nativeType` is now written from the data type its codec represents, so the build needs both lookups. Through the facades, list every extension whose codec the contract uses:

```ts
defineContract({ extensions: { pgvector } }, ({ field, model }) => ({ /* … */ }));
```

A contract written with an empty definition (`defineContract({}, …)`) that names an extension's codec must pass the lookups itself, as an extension's own contract space does:

```ts
import { createDataTypeLookup } from '@internal/framework-components/codec';
import { assemblePostgresCodecRegistryWithBuiltins } from '@internal/target-postgres/codecs';
import { postgresDataTypes } from '@internal/target-postgres/data-types';

export const contract = defineContract(
  {
    codecLookup: assemblePostgresCodecRegistryWithBuiltins([
      { types: { codecTypes: { codecDescriptors: [...pgvectorCodecRegistry.values()] } } },
    ]),
    dataTypeLookup: createDataTypeLookup([...postgresDataTypes, ...pgvectorDataTypes]),
  },
  () => ({ /* … */ }),
);
```

A column whose codec the lookup lacks fails with `CONTRACT.CODEC_DESCRIPTOR_MISSING`; one whose codec's data type the lookup lacks fails with `CONTRACT.DATA_TYPE_UNREGISTERED`. A direct call of `buildSqlContractFromDefinition(definition, codecLookup, dataTypeLookup)` passes both.

## `contract-to-schema-ir-takes-lookups`

```ts
// before
contractToSchemaIR(contract, { annotationNamespace: 'pg', expandNativeType });

// after
contractToSchemaIR(contract, { annotationNamespace: 'pg', dataTypes, codecLookup });
```

`dataTypes` and `codecLookup` come from the assembled stack; in a test, build them with `createDataTypeLookup([...postgresDataTypes, ...extensionDataTypes])` and the target's codec registry.

## `data-type-lookup-lists-all`

Add `all()` to a hand-written `DataTypeLookup`, returning every registered data type in assembly order, or build the lookup with `createDataTypeLookup(types)`.

## `validate-scalar-type-codec-ids-removed`

Delete calls to `validateScalarTypeCodecIds`; the control stack checks the same thing when it is assembled. Fix any assembly error the new checks report in the extension's own contributions.
