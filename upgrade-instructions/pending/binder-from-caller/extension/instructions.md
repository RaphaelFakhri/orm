---
changes:
  - id: psl-interpret-requires-a-binder
    summary: |
      `PslInterpretInput`, `InterpretPslDocumentToSqlContractInput`, and `InterpretPslDocumentToMongoContractInput` all require a `binder`. A `PslInterpretCapable.interpret` implementation, or direct caller of `interpretPslDocumentToSqlContract` / `interpretPslDocumentToMongoContract`, must build it with `createProjectBinder` (or use the new `interpretPslSqlSources` / `interpretPslMongoSources`, which build it internally) and pass it in; it no longer builds its own.
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
  - id: mongo-former-scalar-codec-ids-option-removed
    summary: |
      `MongoContractOptions.formerScalarCodecIds` (passed to `mongoContract`) is removed. Mongo's family descriptor now contributes the same wording directly to the binder; the option has nothing left to configure.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bformerScalarCodecIds\b'
---

# The binder is built once, by the caller

The PSL binder — the pass that resolves every name a schema writes to the symbol it refers to — used to be built separately inside each family's interpreter (`createSqlBinder`, `createMongoBinder`), and parts of its job were duplicated by two guesses living in the framework and in `psl-parser`: one that decided whether an unrecognized dotted name was probably a missing extension pack, and one that decided whether an unrecognized name inside a registered field-preset namespace was probably a misspelled preset. Both guesses, and the binder's own construction, move to a single place: the caller builds the binder once, before calling `interpret`, and the binder's own diagnostics are authoritative.

## `interpret` now takes a `binder`

`PslInterpretInput` (the input to `PslInterpretCapable.interpret`), and the lower-level `InterpretPslDocumentToSqlContractInput` / `InterpretPslDocumentToMongoContractInput`, all gained a required `binder: Binder` field. Build it with `createProjectBinder` from `@internal/psl-parser`, from the same `symbolTable`, `sources`, and `ContractSourceContext` the interpreter already receives:

```diff
+import { createProjectBinder } from '@internal/psl-parser';

 async function interpret(input, context) {
+  const { binder } = createProjectBinder({
+    symbolTable: input.symbolTable,
+    sources: input.sources,
+    context,
+  });
   return interpretPslDocumentToSqlContract({
     documents: input.documents,
     symbolTable: input.symbolTable,
     sources: input.sources,
+    binder,
     // ...
   });
 }
```

If the call site already has `documents`, `sources`, and a `context` but no symbol table or binder yet — the shape `mongoContract`'s and `prismaContract`'s own `load()` start from — call the new `interpretPslSqlSources` (from `@internal/sql-contract-psl/provider`) or `interpretPslMongoSources` (from `@internal/mongo-contract-psl/provider`) instead of assembling the symbol table, binder, and interpreter call by hand. Both build the symbol table and the binder, fold their diagnostics in as seed diagnostics, and interpret in one call:

```diff
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
+const result = interpretPslSqlSources({ documents, sources, context, target, createNamespace });
```

## Two diagnostics folded into `PSL_UNRESOLVED_REFERENCE`

Two helpers that produced their own diagnostic codes for an unrecognized name are removed. Both cases are unresolved references now, and the binder reports them with its own `PSL_UNRESOLVED_REFERENCE` / `Cannot find type "…"` (or `Cannot find field "…"`), with no other diagnostic alongside it.

- **An unrecognized namespace that looked like a missing extension pack.** `checkUncomposedNamespace` and `hasRegisteredFieldNamespace` (`@internal/framework-components/authoring`), and `uncomposedNamespaceDiagnostic` / `reportUncomposedNamespace` (`@internal/psl-parser/interpret`), are removed, along with `PSL_EXTENSION_NAMESPACE_NOT_COMPOSED`. A schema that names `pgvector.Vector` without composing the `pgvector` pack used to get `Type constructor "pgvector.Vector" uses unrecognized namespace "pgvector". Add extension pack "pgvector" to extensions in prisma.config.ts.`; it now gets `Cannot find type "pgvector.Vector"`.

  If custom attribute-spec or type-constructor resolution code called `checkUncomposedNamespace` to decide whether to report this case specially, delete that branch; the binder already reports every name it cannot resolve, including a dotted one.

- **A misspelled field-preset call inside a registered namespace.** `reportUnknownFieldPreset` (`@internal/psl-parser/interpret`) is removed, along with `PSL_UNKNOWN_FIELD_PRESET`. A schema that calls `temporal.createdAtt()` (misspelling `temporal.createdAt()`) used to get `Field "Post.createdAt" references unknown field preset "temporal.createdAtt". Check the spelling against the available presets in the "temporal" namespace.`; it now gets `Cannot find type "temporal.createdAtt"`.

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
