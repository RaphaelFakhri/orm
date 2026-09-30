---
changes:
  - id: spec-contexts-carry-data-types
    summary: |
      `ControlDefaultRegistries` loses `dataTypeEntries`. An attribute spec context carries the stack's data types as `dataTypes: DataTypeSupport`, and `createBinder` and the Mongo PSL interpreter take them as `dataTypes`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bcontrolMutationDefaults\s*:\s*\{[^}]*\bdataTypeEntries\s*:'
        - '\b(AttributeSpecContext|FieldAttributeSpecContext|ControlDefaultRegistries)\b'
        - '\bcreateBinder\s*\('
        - '\binterpretPslDocumentToMongoContract\s*\('
  - id: stack-and-source-context-carry-data-types
    summary: |
      `ControlStack` gains `dataTypes: DataTypeSupport`. `ContractSourceContext`, `InterpretPslDocumentToSqlContractInput` and `InterpretPrisma7DocumentsInput` replace `dataTypeLookup` with `dataTypes: DataTypeSupport`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bdataTypeLookup\s*:'
        - '\bcontext\.dataTypeLookup\b'
  - id: cast-rule-moves-to-the-framework
    summary: |
      `entryForTag`, `WrittenValue` and `DataTypeSupport` are no longer exported from `@internal/sql-contract-psl/resolution`. Import them from `@internal/framework-components/authoring`, which also exports the cast rule for one written value.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - 'import\s*(type\s*)?\{[^}]*\b(entryForTag|WrittenValue|DataTypeSupport)\b[^}]*\}\s*from\s*[''"]@internal/sql-contract-psl/resolution[''"]'
  - id: tagged-literal-text-renames
    summary: |
      The canonical value of a tagged literal is its text: `TaggedLiteralCanonicalization` carries `text`, not `body`; `TaggedLiteralExprAst.body()` is `text()`; `parseJsonBody` and `printJsonBody` are `parseJsonText` and `printJsonText`.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\b(parseJsonBody|printJsonBody)\b'
        - '\b(canonicalizeTaggedLiteralBody|TaggedLiteralCanonicalization|TaggedLiteralExprAst)\b'
  - id: default-refusals-point-at-the-written-value
    summary: |
      `@default` reports `PSL_VALUE_TYPE_INCOMPATIBLE` and `PSL_INVALID_LITERAL` at the written value, or at the list element they are about, not at the whole attribute. The `@default` list no longer offers `sql` as an element.
    detection:
      glob: "**/*.{ts,mts,cts,js,mjs}"
      matches:
        - '\bPSL_VALUE_TYPE_INCOMPATIBLE\b'
        - '\bPSL_INVALID_LITERAL\b'
        - 'list of \([^)]*\bsql`\.\.\.`'
---

# Arguments typed by a data type

## Spec contexts carry the stack's data types

`ControlDefaultRegistries` held the function registry and the stack's data type authoring entries. It now holds only `defaultFunctionRegistry`. The data types move to the attribute spec context, with their lookup:

```ts
import type { DataTypeSupport } from '@internal/framework-components/authoring';

interface AttributeSpecContext {
  readonly symbols: SymbolTable;
  readonly model: ModelSymbol;
  readonly controlMutationDefaults: ControlDefaultRegistries;
  readonly dataTypes: DataTypeSupport; // { entries, lookup }
}
```

Where code builds a spec context, a binder or a Mongo interpreter input, move the entries out of `controlMutationDefaults` and pass the stack's data types beside it:

```diff
  createBinder({
    sources,
    symbolTable,
    typeConstructors,
    attributeSpecs,
-   controlMutationDefaults: { defaultFunctionRegistry, dataTypeEntries: context.authoringContributions.dataTypes },
+   controlMutationDefaults: { defaultFunctionRegistry },
+   dataTypes: context.dataTypes,
  });
```

- `createBinder` requires `dataTypes`.
- `interpretPslDocumentToMongoContract` requires `dataTypes`.
- A spec context literal (`{ symbols, model, controlMutationDefaults }`) adds `dataTypes`.
- A stack that registers no data types, and a test that needs none, passes `EMPTY_DATA_TYPES` from `@internal/psl-parser`.
- A spec factory that read `ctx.controlMutationDefaults.dataTypeEntries` reads `ctx.dataTypes.entries`.

## The stack and the contract source context carry the data types as one pair

`ControlStack` gains `dataTypes: DataTypeSupport`: its registered data types (`lookup`, the same object as `dataTypeLookup`) with their authoring entries (`entries`, the same object as `authoringContributions.dataTypes`). `ContractSourceContext` replaces `dataTypeLookup` with the same `dataTypes`, and so do the inputs of the SQL and Prisma 7 interpreters. The SQL interpreter no longer reads entries from `authoringContributions.dataTypes`.

```diff
  const context: ContractSourceContext = {
    authoringContributions: stack.authoringContributions,
-   dataTypeLookup: stack.dataTypeLookup,
+   dataTypes: stack.dataTypes,
    ...
  };

  interpretPslDocumentToSqlContract({
-   dataTypeLookup: lookup,
-   authoringContributions: { ...contributions, dataTypes: entries },
+   dataTypes: { entries, lookup },
+   authoringContributions: contributions,
    ...
  });
```

A test that passed a lookup without entries passes `{ entries: {}, lookup }`. Code that read `context.dataTypeLookup` reads `context.dataTypes.lookup`.

## The cast rule for one written value is in the framework

`@internal/framework-components/authoring` exports the ADR 254 cast rule for one written value: `WrittenValue`, `WrittenScalar`, `DataTypeSupport`, `TypedValue`, `entryForTag`, `entryForPlain`, `knownTags`, `readWrittenValue`, `castTypedValue`, `admittedTags` and `describeAdmittedForms`. `@internal/sql-contract-psl/resolution` no longer exports `entryForTag`, `WrittenValue` or `DataTypeSupport`; change those imports to `@internal/framework-components/authoring`. `readDataTypeDefault`, `DefaultRefusal` and `DefaultColumn` stay in `@internal/sql-contract-psl/resolution`, unchanged.

`entryForTag` now returns the key as a `DataTypeId`.

`@internal/psl-parser` adds the argument type `dataTypeValue(dataType, support)`, which admits any literal the cast rule admits for `dataType`, and `readWrittenScalar`. No built-in attribute uses `dataTypeValue` yet.

## The canonical value of a tagged literal is its text

The body is what is written between the quotes; the text is the canonical value. Three names change:

| Old | New |
| --- | --- |
| `TaggedLiteralCanonicalization` `{ ok: true, body }`, from `canonicalizeTaggedLiteralBody` | `{ ok: true, text }` |
| `TaggedLiteralExprAst.body()` | `TaggedLiteralExprAst.text()` |
| `parseJsonBody`, `printJsonBody` from `@internal/sql-relational-core/ast` | `parseJsonText`, `printJsonText` |

An entry that registers the `json` tag changes its imports:

```diff
- written: { kind: 'tag', tag: 'json', parse: parseJsonBody },
- print: printJsonBody,
+ written: { kind: 'tag', tag: 'json', parse: parseJsonText },
+ print: printJsonText,
```

The `why` of the `CONTRACT.INVALID_JSON_LITERAL` error `parseJsonText` throws reads `The text is not a JSON document.`

## `@default` refusals point at the written value

`PSL_VALUE_TYPE_INCOMPATIBLE` and `PSL_INVALID_LITERAL` from `@default` used to point at the whole `@default(...)` attribute. They now point at the written value, or at the list element the message names. The codes and messages are unchanged. `PSL_DEFAULT_LIST_EXPECTED` and `PSL_INVALID_DEFAULT_LITERAL` still point at the attribute. This supersedes the last row of the table in the pending `sql-is-a-data-type` instructions: a `sql` literal inside a list literal is reported at the element.

The list arm of `@default` no longer offers `sql` as an element, so its label is `list of (string | number | boolean | json`...`)`, and so is the end of the `Expected one of` message. Update an assertion on the span of one of these diagnostics, or on that message.
