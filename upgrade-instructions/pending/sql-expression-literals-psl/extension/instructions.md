---
changes:
  - id: raw-sql-is-a-sql-literal
    summary: |
      `@@index(where:)`, `@@index(expression:)`, `@@fullTextIndex(where:)`, `@@check(expression:)` and a policy's `using` and `withCheck` take `sql` literals. A quoted string there is refused with `PSL_VALUE_TYPE_INCOMPATIBLE`.
    detection:
      glob: "**/*.prisma"
      matches:
        - '\b(where|expression)\s*:\s*["'']'
        - '^\s*(using|withCheck)\s*=\s*["'']'
    script: ./scripts/rewrite-sql-strings.mjs
  - id: storage-hash-may-change-once
    summary: |
      A raw SQL text with indentation, a blank first or last line or CRLF line breaks is stored as its canonical text once it is written as a `sql` literal, which changes the contract's storage hash once.
    detection:
      glob: "**/*.prisma"
      matches:
        - '\b(where|expression)\s*:\s*["'']'
        - '^\s*(using|withCheck)\s*=\s*["'']'
  - id: spec-contexts-carry-data-types
    summary: |
      `BlockSpecContext` gains `dataTypes`, and `interpretExtensionBlocks`, `interpretExtensionBlock` and `interpretExtensionBlockAttributes` take a required `dataTypes`. `ControlDefaultRegistries` is deleted: an attribute spec context, `createBinder` and the Mongo PSL interpreter take `defaultFunctionRegistry` directly.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\b(BlockSpecContext|ControlDefaultRegistries|interpretExtensionBlocks|interpretExtensionBlock|interpretExtensionBlockAttributes)\b'
        - 'controlMutationDefaults:\s*\{\s*defaultFunctionRegistry'
  - id: supabase-contract-writes-sql-literals
    summary: |
      A pack's PSL contract, such as the Supabase pack's `src/contract/contract.prisma`, writes its raw SQL as `sql` literals. Its `contract.json` does not change.
    detection:
      glob: "**/src/contract/contract.prisma"
      matches:
        - '\b(where|expression)\s*:\s*["'']'
        - '^\s*(using|withCheck)\s*=\s*["'']'
---

# Raw SQL in PSL is a `sql` literal

## Every place that holds raw SQL takes a `sql` literal

Raw SQL in a PSL schema is written as a `sql` literal, the form `@default` already uses. A quoted string is refused in `@@index(where:)`, `@@index(expression:)`, `@@fullTextIndex(where:)`, `@@check(expression:)`, and a policy's `using` and `withCheck`:

```diff
- @@index([email], where: "(archived_at IS NULL)", name: "users_email_active")
+ @@index([email], where: sql`(archived_at IS NULL)`, name: "users_email_active")
- @@check(expression: "total > 0", name: "order_total_positive")
+ @@check(expression: sql`total > 0`, name: "order_total_positive")
- using = "\"userId\"::uuid = auth.uid()"
+ using = sql`"userId"::uuid = auth.uid()`
```

Inside a `sql` literal no quote is escaped. Run the script from the package root to rewrite every `.prisma` file, including test fixtures and PSL held in `.prisma` files your tests read:

```sh
node <this-directory>/scripts/rewrite-sql-strings.mjs '**/*.prisma'
```

It decodes each quoted string's escapes and writes the same text as a `sql` literal, in the double-quote form `sql"..."` when the text holds a backtick. It prints each changed file and its number of rewrites. It does not see PSL written inline in TypeScript, such as a schema string in a test; rewrite those by hand the same way.

A place left as a quoted string is refused when the schema is interpreted: ``sql/expression has no cast from pg/text; write it as sql`(archived_at IS NULL)` ``, or `... write it as a sql literal` when the text would read back from a `sql` literal as different text. A test that asserts the old acceptance, or the text of these messages, needs the new form.

`contract infer` writes these places as `sql` literals and skips an object whose SQL would read back as different text, with a comment such as `// prisma: skipped check "c": its SQL cannot be written as a sql literal that reads back unchanged`. `contract print` refuses such an object with `CONTRACT.PRINT_UNSUPPORTED`. A test that snapshots printed PSL expects `sql` literals.

## The storage hash may change once

A `sql` literal stores its canonical text: common indentation, a blank first and last line, and carriage returns are removed. A quoted string whose text had any of these is stored differently once it is rewritten, so the contract's storage hash changes once. Wire names of indexes, checks and policies do not change. Emit the contract again, and for a pack with migrations run `prisma migration plan` once and commit the migration, which has no operations.

## Spec contexts carry the stack's data types

A block spec can now read the stack's data types, so a block parameter can receive a data type through `dataTypeValue`:

```ts
function policyUsingParam(ctx: BlockSpecContext) {
  return {
    type: optional(dataTypeValue(SQL_EXPRESSION_DATA_TYPE_ID, ctx.dataTypes)),
    documentation: 'A SQL predicate controlling which rows this policy permits.',
  };
}
```

- `BlockSpecContext` is `{ symbols, block, dataTypes }`. Code that builds one passes the stack's `DataTypeSupport`, or `EMPTY_DATA_TYPES` from `@internal/psl-parser` when the stack registers none.
- `interpretExtensionBlocks`, `interpretExtensionBlock` and `interpretExtensionBlockAttributes` take a required `dataTypes`. Pass the stack's data types, the same value the attribute spec context carries.
- `ControlDefaultRegistries` is deleted. `AttributeSpecContext`, `CreateBinderOptions` and `InterpretPslDocumentToMongoContractInput` take `defaultFunctionRegistry: ControlMutationDefaultRegistry` in place of `controlMutationDefaults`:

```diff
- controlMutationDefaults: { defaultFunctionRegistry },
+ defaultFunctionRegistry,
```

A spec factory that read `ctx.controlMutationDefaults.defaultFunctionRegistry` reads `ctx.defaultFunctionRegistry`.

This supersedes the `ControlDefaultRegistries` text of the `spec-contexts-carry-data-types` change in the pending `arguments-typed-by-data-type` extension instructions: `ControlDefaultRegistries` no longer exists, and its one field is on the context directly.

A spec that takes raw SQL can do what the SQL family and Postgres now do: declare `dataTypeValue(SQL_EXPRESSION_DATA_TYPE_ID, ctx.dataTypes)`, with `SQL_EXPRESSION_DATA_TYPE_ID` from `@internal/sql-contract/sql-expression`. The value it returns holds the canonical text; `sqlTextFromCanonical(value.value)` reads it.

## A pack's PSL contract writes `sql` literals

A pack that ships a PSL contract, such as the Supabase pack's `src/contract/contract.prisma`, rewrites its raw SQL with the script above and regenerates its contract (for Supabase, `pnpm --filter @internal/extension-supabase run contract:generate`). The texts in the Supabase contract are already canonical, so its `contract.json` and `contract.d.ts` do not change.
