---
changes:
  - id: render-full-text-index-expression-takes-a-definition
    summary: |
      `renderFullTextIndexExpression` from `@internal/target-postgres/sql-utils` takes the index definition `{ fields, language }` and a nullability test instead of a language and one column name.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\brenderFullTextIndexExpression\s*\('
  - id: index-types-declare-backs-foreign-key
    summary: |
      Every index type registered with `defineIndexTypes().add(...)` or `IndexTypeRegistry.register(...)` declares `backsForeignKey: true | false`. A registration without it is refused with `CONTRACT.PACK_CONTRIBUTION_INVALID` when a contract is built.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\bdefineIndexTypes\s*\('
        - '\.register\s*\(\s*\{\s*type\s*:'
  - id: foreign-key-backing-takes-the-index-type-rule
    summary: |
      `backingIndexColumnKeys`, `materializeForeignKeysAndIndexes`, `inferRelations` and `buildChildRelationField` take the rule that says whether an index type can back a foreign key. An index with a `where` predicate never backs one.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\b(backingIndexColumnKeys|materializeForeignKeysAndIndexes|inferRelations|buildChildRelationField)\s*\('
  - id: structured-index-option-values-hash-as-json
    summary: |
      An index option whose value is an array or an object now enters the index name's hash as JSON rather than through `String()`. A wire-named index with such an option gets a new name; re-emit contracts that declare one.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - 'constraints\.index\([\s\S]*options:\s*\{[^}]*[\[{]'
---

# A full-text index is stored as data

## `render-full-text-index-expression-takes-a-definition`

The renderer now draws the whole search document of a full-text index, which may cover several columns in weight groups. Pass the definition the contract stores in the index's `options`, and say which columns are nullable:

```diff
-renderFullTextIndexExpression('english', 'body')
+renderFullTextIndexExpression({ fields: [['body']], language: 'english' }, () => false)
```

One field renders exactly what it rendered before, `to_tsvector('english', "body")`. The nullability test only matters for a document of several columns, where a nullable column is wrapped in `coalesce`.

A Postgres full-text index in a contract is now a `gin` index with `columns` and `options: { fields, language }`, not an expression. Code that reads indexes from a contract recognises a full-text index by `type === 'gin'` with `options.fields` present, and must not treat its `columns` as a plain index over those columns.

## `index-types-declare-backs-foreign-key`

A foreign key gets a derived backing index unless an index of its table already covers its columns. An index of a registered type counts only when its registration says the type can serve the foreign key's lookups. Declare it for each type your pack registers:

```diff
 export const myIndexTypes = defineIndexTypes()
-  .add('bm25', { options: bm25Options });
+  .add('bm25', { options: bm25Options, backsForeignKey: false });
```

Declare `true` only for a type whose index answers equality lookups on its leading columns, as a btree or hash index does. A search, spatial or range-summary index declares `false`. A direct `IndexTypeRegistry.register({ type, options })` call adds `backsForeignKey` the same way.

## `foreign-key-backing-takes-the-index-type-rule`

The functions that decide whether a foreign key is already backed take the rule as an argument:

```diff
-backingIndexColumnKeys({ indexes, uniques, primaryKey })
+backingIndexColumnKeys({ indexes, uniques, primaryKey }, (indexType) => registry.backsForeignKey(indexType))

-materializeForeignKeysAndIndexes(table, foreignKeys, declaredIndexes, uniques, primaryKey)
+materializeForeignKeysAndIndexes(table, foreignKeys, declaredIndexes, uniques, primaryKey, backsForeignKey)

-inferRelations(tables, modelNameMap)
+inferRelations(tables, modelNameMap, backsForeignKey)

-buildChildRelationField(name, parentModel, fk, optional, relationName, hostTable)
+buildChildRelationField(name, parentModel, fk, optional, relationName, { table: hostTable, backsForeignKey })
```

`IndexTypeRegistry.backsForeignKey(type)` answers the rule for the registered types and returns `false` for any other. An index without a type always counts, and an index with a `where` predicate never does.

## `structured-index-option-values-hash-as-json`

`normalizeIndexOptionValue` from `@internal/sql-schema-ir/naming` writes an array or object value as JSON, so `[['a', 'b']]` and `[['a'], ['b']]` no longer hash to the same index name. Scalar values hash as before. If an extension's contract declares a wire-named index whose options hold an array or an object, rebuild its contract space so the emitted index name and storage hash move together.
