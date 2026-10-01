---
changes:
  - id: re-emit-contracts-with-a-full-text-index
    summary: |
      A full-text index is stored in `contract.json` as data: a `gin` index over its columns whose `options` hold the weight groups and the language, with no `expression`. Its storage hash and its index name change. Re-emit the contract and plan a migration, which renames the index; the index itself is unchanged.
    detection:
      glob: "**/*.{prisma,ts,mts}"
      matches:
        - '@@fullTextIndex\s*\('
        - '(?<![\w$.])fullTextIndex\s*\('
  - id: foreign-key-backing-index-for-partial-and-search-indexes
    summary: |
      A partial index, or a Postgres gin, gist, spgist or brin index (a full-text index included), no longer stands in for a foreign key's backing index. A contract whose foreign key columns were covered only by such an index now gets a backing index: re-emit the contract and plan a migration, which creates it.
    detection:
      glob: "**/*.{prisma,ts,mts}"
      matches:
        - '@@fullTextIndex\s*\('
        - '(?<![\w$.])fullTextIndex\s*\('
        - '@@index\s*\([^)]*\bwhere\s*:'
        - '@@index\s*\([^)]*\btype\s*:\s*"(gin|gist|spgist|brin)"'
        - "type:\\s*'(gin|gist|spgist|brin)'"
        - '\.index\s*\([\s\S]*?\bwhere\s*:'
  - id: full-text-index-one-field-diagnostic-removed
    summary: |
      `@@fullTextIndex` now takes several fields, so the diagnostic `PSL_FULL_TEXT_INDEX_ONE_FIELD` is gone. Code that asserts it asserts a diagnostic that is never raised.
    detection:
      glob: "**/*.{ts,mts,cts,js,mjs}"
      matches:
        - '\bPSL_FULL_TEXT_INDEX_ONE_FIELD\b'
---

# A full-text index is stored as data

## `re-emit-contracts-with-a-full-text-index`

`@@fullTextIndex` and the TypeScript `fullTextIndex` helper used to store a SQL expression in the contract. They now store the index's definition, and the SQL is rendered from it when the index is created and when a query searches it. For `@@fullTextIndex([title], name: "post_title_search")` the emitted index changes like this:

```diff
 {
-  "expression": "to_tsvector('english', \"title\")",
-  "name": "post_title_search_724b05e5",
+  "columns": ["title"],
+  "name": "post_title_search_fef4158d",
+  "options": { "fields": [["title"]], "language": "english" },
   "prefix": "post_title_search",
   "type": "gin",
   "unique": false
 }
```

The schema source does not change. Do this:

1. Run `prisma contract emit` and commit the regenerated `contract.json` and `contract.d.ts`. The storage hash changes. Do not hand-edit the generated files.
2. Run `prisma migration plan`. The index's name ends in a hash of its contract entry, so the name changes and the plan renames the index: `ALTER INDEX "post_title_search_724b05e5" RENAME TO "post_title_search_fef4158d"`. The index keeps its definition and does not need to be rebuilt. Apply the migration as usual.

A database whose index was created under the old name reports that index as missing, and the old one as unexpected, until this migration is applied.

If code reads a full-text index's `expression` from the contract, read `options.fields` and `options.language` instead. `fields` lists the weight groups, each a list of storage column names. The search document is no longer stored anywhere in the contract.

An index declared with `map:` keeps its exact name, so neither the name nor the database changes. Only the storage hash moves.

A full-text index can now cover several fields, each top-level item a weight group, strongest first. This is optional:

```prisma
@@fullTextIndex([[title, subtitle], body], name: "post_search")
```

To search it, pass the same groups to `fns.fullTextMatches` and `fns.fullTextRank` in the SQL builder: `fns.fullTextMatches([[f.title, f.subtitle], [f.body]], q)`.

## `foreign-key-backing-index-for-partial-and-search-indexes`

A foreign key gets a backing index, named `<table>_<columns>_idx`, unless an index of the table already covers its columns in the same order. That covering index now counts only if it can serve the foreign key's lookups:

- it has no `where:` predicate, and
- it has no `type:`, or its type is one the target declares able to back a foreign key. On Postgres those are `btree` and `hash`. `gin`, `gist`, `spgist` and `brin` cannot, and neither can ParadeDB's `bm25`. A full-text index is a `gin` index.

Unique constraints and the primary key count as before. On SQLite only the `where:` rule applies, because SQLite indexes have no type.

If a foreign key's columns were covered only by such an index, for example:

```prisma
model Post {
  id       Int    @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  @@fullTextIndex([authorId], name: "post_author_search")
}
```

then the re-emitted contract gains the backing index `post_authorId_idx_<hash>`, and `prisma migration plan` creates it. Apply that migration. If you do not want the index, declare the relation with `index: false` (`@relation(fields: [...], references: [...], index: false)`, or `fk: { index: false }` in TypeScript) and re-emit; the plan then has no operation for it.

`prisma contract infer` follows the same rule: for a live foreign key covered only by such an index, the inferred `@relation` now carries `index: false`.

## `full-text-index-one-field-diagnostic-removed`

`@@fullTextIndex([a, b])` was refused with `PSL_FULL_TEXT_INDEX_ONE_FIELD`. It is now a valid index with two weight groups, and that code is never raised. Remove assertions on it. The new refusals are `PSL_FULL_TEXT_INDEX_TOO_MANY_GROUPS` (more than four groups), `PSL_FULL_TEXT_INDEX_EMPTY_GROUP` (an empty group or no fields) and `PSL_FULL_TEXT_INDEX_DUPLICATE_FIELD` (a field named twice). `PSL_FULL_TEXT_INDEX_TEXT_FIELD`, `PSL_FULL_TEXT_INDEX_REQUIRES_NAME` and `PSL_FULL_TEXT_INDEX_NAME_XOR_MAP` are unchanged.
