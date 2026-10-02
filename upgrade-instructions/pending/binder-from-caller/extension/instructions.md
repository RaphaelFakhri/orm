---
changes:
  - id: psl-interpret-requires-a-binder
    summary: |
      `PslInterpretInput`, `InterpretPslDocumentToSqlContractInput`, and `InterpretPslDocumentToMongoContractInput` all require a `binder`. A `PslInterpretCapable.interpret` implementation, or direct caller of `interpretPslDocumentToSqlContract` / `interpretPslDocumentToMongoContract`, must pass it in; the interpreter no longer builds its own. An `interpret` implementation receives it as `input.binder`; a caller that starts from parsed documents builds it with `createProjectBinder`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\binterpretPslDocumentTo(Sql|Mongo)Contract\s*\('
        - '\bPslInterpretCapable\b'
  - id: uncomposed-namespace-guess-removed
    summary: |
      `checkUncomposedNamespace` and `hasRegisteredFieldNamespace` (from `@internal/framework-components/authoring`) and `uncomposedNamespaceDiagnostic` / `reportUncomposedNamespace` (from `@internal/psl-parser/interpret`) are removed, along with the diagnostic code `PSL_EXTENSION_NAMESPACE_NOT_COMPOSED`. A dotted name in an unrecognized namespace is now refused by the binder itself, as `PSL_UNRESOLVED_REFERENCE`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bcheckUncomposedNamespace\b'
        - '\bhasRegisteredFieldNamespace\b'
        - '\buncomposedNamespaceDiagnostic\b'
        - '\breportUncomposedNamespace\b'
        - '\bPSL_EXTENSION_NAMESPACE_NOT_COMPOSED\b'
  - id: unknown-field-preset-diagnostic-removed
    summary: |
      `reportUnknownFieldPreset` (from `@internal/psl-parser/interpret`) is removed, along with the diagnostic code `PSL_UNKNOWN_FIELD_PRESET`. A misspelled field-preset call is now refused by the binder itself, as `PSL_UNRESOLVED_REFERENCE`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\breportUnknownFieldPreset\b'
        - '\bPSL_UNKNOWN_FIELD_PRESET\b'
  - id: binder-binds-field-presets
    summary: |
      `createBinder`'s `typeConstructors` option is renamed `contributedTypes` and takes a `ContributedTypeNamespace`, which holds field presets as well as type constructors. `ContributedTypeSymbol.descriptor` is now a `ContributedTypeDescriptor`: an `AuthoringTypeConstructorDescriptor` or an `AuthoringFieldPresetDescriptor`, told apart by `kind`. Code that reads `descriptor.entityRefArg`, `descriptor.documentation` or `descriptor.deprecated`, which only a type constructor has, checks `descriptor.kind === 'typeConstructor'` first.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\btypeConstructors\s*:'
        - '\bContributedTypeSymbol\b'
        - "kind\\s*===\\s*'contributedType'"
  - id: resolve-field-type-descriptor-removed
    summary: |
      `resolveFieldTypeDescriptor` is no longer exported from `@internal/sql-contract-psl/resolution`. A caller that builds a type-constructor call itself takes the descriptor from the registry and calls `instantiateFieldTypeConstructor({ call, descriptor, diagnostics, source, entityLabel, namespaceId, namespaceExtensionEntities, codecLookup })`. Its failure result is `{ ok: false }`, with no `alreadyReported` flag: every failure has been reported.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bresolveFieldTypeDescriptor\b'
        - '\balreadyReported\b'
  - id: mongo-former-scalar-codec-ids-option-removed
    summary: |
      `MongoContractOptions.formerScalarCodecIds` (passed to `mongoContract`) is removed. Mongo's family descriptor now contributes the same wording directly to the binder; the option has nothing left to configure.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bformerScalarCodecIds\b'
  - id: field-attribute-spec-context-carries-type-resolution
    summary: |
      `FieldAttributeSpecContext` (from `@internal/psl-parser`) requires `typeResolution: Resolution | undefined`, the binder's resolution of the field's type. Code that builds the context passes `binder.symbolForNode(typeReferenceNode(field))`; a field-attribute spec factory that looked up the field's type by `field.typeName` in `symbols` reads `ctx.typeResolution` instead.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bFieldAttributeSpecContext\b'
        - '\bFieldAttributeSpecFactory\b'
---

# The binder is built once, by the caller

The PSL binder — the pass that resolves every name a schema writes to the symbol it refers to — used to be built separately inside each family's interpreter (`createSqlBinder`, `createMongoBinder`), and parts of its job were duplicated by two guesses living in the framework and in `psl-parser`: one that decided whether an unrecognized dotted name was probably a missing extension pack, and one that decided whether an unrecognized name inside a registered field-preset namespace was probably a misspelled preset. Both guesses, and the binder's own construction, move to a single place: the caller builds the binder once, before calling `interpret`, and the binder's own diagnostics are authoritative.

## `interpret` now takes a `binder`

`PslInterpretInput` (the input to `PslInterpretCapable.interpret`), and the lower-level `InterpretPslDocumentToSqlContractInput` / `InterpretPslDocumentToMongoContractInput`, all gained a required `binder: Binder` field. A `PslInterpretCapable.interpret` implementation receives the binder as `input.binder` and passes it to the interpreter:

```diff
 interpret(input, context) {
   return interpretPslDocumentToSqlContract({
     documents: input.documents,
     symbolTable: input.symbolTable,
     sources: input.sources,
+    binder: input.binder,
     // ...
   });
 }
```

A caller that starts from parsed `documents` and `sources` and a `ContractSourceContext`, the way `prismaContract`'s and `mongoContract`'s own `load()` do, builds the symbol table and the binder itself with `buildSymbolTable` and `createProjectBinder` from `@internal/psl-parser`, passes the binder to the interpreter, and adds the diagnostics of both to the result with `withSeedDiagnostics` from `@internal/psl-parser/interpret`:

```diff
-import { buildSymbolTable } from '@internal/psl-parser';
+import { buildSymbolTable, createProjectBinder, mapPslDiagnostics } from '@internal/psl-parser';
+import { withSeedDiagnostics } from '@internal/psl-parser/interpret';

-const { symbolTable } = buildSymbolTable({ documents, sources });
-const result = interpretPslDocumentToSqlContract({
-  documents,
-  symbolTable,
-  sources,
-  target,
-  createNamespace,
-  authoringContributions: context.authoringContributions,
-  // ...
-});
+const { symbolTable, diagnostics: symbolTableDiagnostics } = buildSymbolTable({ documents, sources });
+const { binder, diagnostics: binderDiagnostics } = createProjectBinder({ symbolTable, sources, context });
+const result = withSeedDiagnostics(
+  interpretPslDocumentToSqlContract({
+    documents,
+    symbolTable,
+    sources,
+    binder,
+    target,
+    createNamespace,
+    authoringContributions: context.authoringContributions,
+    // ...
+  }),
+  mapPslDiagnostics([...symbolTableDiagnostics, ...binderDiagnostics], sources),
+);
```

## Two diagnostics folded into `PSL_UNRESOLVED_REFERENCE`

Two helpers that produced their own diagnostic codes for an unrecognized name are removed. Both cases are unresolved references now, and the binder reports them with its own `PSL_UNRESOLVED_REFERENCE` / `Cannot find type "…"` (or `Cannot find field "…"`), with no other diagnostic alongside it.

- **An unrecognized namespace that looked like a missing extension pack.** `checkUncomposedNamespace` and `hasRegisteredFieldNamespace` (`@internal/framework-components/authoring`), and `uncomposedNamespaceDiagnostic` / `reportUncomposedNamespace` (`@internal/psl-parser/interpret`), are removed, along with `PSL_EXTENSION_NAMESPACE_NOT_COMPOSED`. A schema that names `pgvector.Vector` without composing the `pgvector` pack used to get `Type constructor "pgvector.Vector" uses unrecognized namespace "pgvector". Add extension pack "pgvector" to extensions in prisma.config.ts.`; it now gets `Cannot find type "pgvector.Vector"`.

  If custom attribute-spec or type-constructor resolution code called `checkUncomposedNamespace` to decide whether to report this case specially, delete that branch; the binder already reports every name it cannot resolve, including a dotted one.

- **A misspelled field-preset call inside a registered namespace.** `reportUnknownFieldPreset` (`@internal/psl-parser/interpret`) is removed, along with `PSL_UNKNOWN_FIELD_PRESET`. A schema that calls `temporal.createdAtt()` (misspelling `temporal.createdAt()`) used to get `Field "Post.createdAt" references unknown field preset "temporal.createdAtt". Check the spelling against the available presets in the "temporal" namespace.`; it now gets `Cannot find type "temporal.createdAtt"`.

## The binder binds a field preset to the preset

`createBinder`'s `typeConstructors` option is renamed `contributedTypes`. It takes a `ContributedTypeNamespace` from `@internal/psl-parser`, which holds field presets alongside type constructors; `createProjectBinder` passes the stack's `type` and `field` contributions merged into one tree, so a preset name such as `temporal.createdAt` resolves to a symbol that carries the preset's own descriptor. Rename the option where you build a binder yourself:

```diff
 createBinder({
   sources,
   symbolTable,
-  typeConstructors: authoringContributions.type,
+  contributedTypes: authoringContributions.type,
   attributeSpecs,
   controlMutationDefaults,
 });
```

`ContributedTypeSymbol.descriptor` (the `symbol` of a `contributedType` resolution) is now `AuthoringTypeConstructorDescriptor | AuthoringFieldPresetDescriptor`. Branch on `descriptor.kind` before reading a property only a type constructor has, such as `entityRefArg`, `documentation` or `deprecated`:

```diff
 if (resolution.kind === 'contributedType') {
   const { descriptor } = resolution.symbol;
-  if (descriptor.entityRefArg !== undefined) { … }
+  if (descriptor.kind === 'typeConstructor' && descriptor.entityRefArg !== undefined) { … }
 }
```

A name the binder resolved to a field preset no longer needs a lookup by its written path: take the preset descriptor from the resolution instead of calling `getAuthoringFieldPreset(contributions, path)`.

## `resolveFieldTypeDescriptor` is no longer exported

`@internal/sql-contract-psl/resolution` no longer exports `resolveFieldTypeDescriptor`; the SQL PSL interpreter now resolves a field's type from the binder's resolution of it. A caller without a binder that maps a type to a type-constructor call itself, as the Prisma 7 contract source does, takes the constructor's descriptor from the registry and instantiates it with `instantiateFieldTypeConstructor`:

```diff
-import { resolveFieldTypeDescriptor } from '@internal/sql-contract-psl/resolution';
+import { getAuthoringTypeConstructor } from '@internal/framework-components/authoring';
+import { instantiateFieldTypeConstructor } from '@internal/sql-contract-psl/resolution';

-const resolved = resolveFieldTypeDescriptor({
-  field: { ...field, typeConstructor: call },
-  typeReferenceResolved: true,
-  enumTypeDescriptors: new Map(),
-  namedTypeDescriptors: new Map(),
-  scalarColumnDescriptors,
-  authoringContributions,
-  diagnostics,
-  sources,
-  entityLabel,
-  namespaceId,
-  namespaceExtensionEntities,
-  codecLookup,
-});
-if (!resolved.ok) {
-  if (!resolved.alreadyReported) reportUnsupportedType();
-  return;
-}
+const descriptor = getAuthoringTypeConstructor(authoringContributions, call.path);
+if (descriptor === undefined) {
+  reportUnsupportedType();
+  return;
+}
+const resolved = instantiateFieldTypeConstructor({
+  call,
+  descriptor,
+  diagnostics,
+  source: diagnosticSource(sources, field.node.syntax),
+  entityLabel,
+  namespaceId,
+  namespaceExtensionEntities,
+  codecLookup,
+});
+if (!resolved.ok) return;
```

A field typed with a type constructor that needs an argument, written without a call (`embedding Vector`), is now reported as `PSL_TYPE_CONSTRUCTOR_NOT_CALLED` instead of `PSL_UNSUPPORTED_FIELD_TYPE`.

## Mongo's `formerScalarCodecIds` option is removed

`mongoContract`'s `MongoContractOptions.formerScalarCodecIds` (a scalar name an earlier Prisma schema used, mapped to the codec it stored as) is removed. The message it produced — naming the current replacement for a Prisma 6 scalar name such as `BigInt` or `Bytes` — is now built into the Mongo family's own contribution to the binder, with no caller-supplied table. Delete the option, and its import if nothing else in the file uses `prisma6MongoBinding`:

```diff
-import { prisma6MongoBinding } from '@internal/target-mongo/prisma6-binding';

 mongoContract(contractPath, {
   output,
   enumInferenceCodecs: { text: MONGO_STRING_CODEC_ID, int: MONGO_INT32_CODEC_ID },
-  formerScalarCodecIds: prisma6MongoBinding.scalarCodecIds,
 });
```

A field still typed with `BigInt`, `Bytes`, or `Decimal` is refused the same way as before: `Field "Post.value" has type "BigInt", which is not a Mongo scalar type; use "Int64" (stored as BSON long).`

## A field-attribute spec context carries the field's type resolution

`FieldAttributeSpecContext` gained a required `typeResolution: Resolution | undefined` field: the binder's resolution of the field's written type, or `undefined` when the field has no type reference. Code that builds the context passes it from the binder:

```diff
+import { typeReferenceNode } from '@internal/psl-parser';

+const node = typeReferenceNode(field);
 const spec = factory({
   symbols,
   model,
   field,
+  typeResolution: node === undefined ? undefined : binder.symbolForNode(node),
   controlMutationDefaults,
 });
```

A field-attribute spec factory that found the field's type by its written name in `ctx.symbols` reads `ctx.typeResolution` instead:

```diff
-const block = ctx.symbols.topLevel.blocks[ctx.field.typeName];
-if (block === undefined || block.keyword !== 'enum') return undefined;
+const resolution = ctx.typeResolution;
+if (resolution?.kind !== 'block' || resolution.symbol.keyword !== 'enum') return undefined;
+const block = resolution.symbol;
```
