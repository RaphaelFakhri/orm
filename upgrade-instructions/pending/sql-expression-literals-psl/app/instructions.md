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
---

# Raw SQL in PSL is a `sql` literal

## Every place that holds raw SQL takes a `sql` literal

Raw SQL in a PSL schema is written as a `sql` literal, the form `@default` already uses. A quoted string is refused in these places:

| Place | Before | After |
| --- | --- | --- |
| `@@index(where:)` | `@@index([email], where: "(archived_at IS NULL)", name: "users_email_active")` | ``@@index([email], where: sql`(archived_at IS NULL)`, name: "users_email_active")`` |
| `@@index(expression:)` | `@@index(expression: "lower(email)", name: "users_email_lower")` | ``@@index(expression: sql`lower(email)`, name: "users_email_lower")`` |
| `@@fullTextIndex(where:)` | `@@fullTextIndex([text], where: "archived_at IS NULL", name: "message_text_search_live")` | ``@@fullTextIndex([text], where: sql`archived_at IS NULL`, name: "message_text_search_live")`` |
| `@@check(expression:)` | `@@check(expression: "total > 0", name: "order_total_positive")` | ``@@check(expression: sql`total > 0`, name: "order_total_positive")`` |
| a policy's `using` | `using = "\"userId\"::uuid = auth.uid()"` | ``using = sql`"userId"::uuid = auth.uid()` `` |
| a policy's `withCheck` | `withCheck = "\"userId\"::uuid = auth.uid()"` | ``withCheck = sql`"userId"::uuid = auth.uid()` `` |

Inside a `sql` literal no quote is escaped: `\"` becomes `"`. A literal may span lines.

Run the script from the project root to rewrite every `.prisma` file:

```sh
node <this-directory>/scripts/rewrite-sql-strings.mjs '**/*.prisma'
```

It finds each quoted string in those places, decodes its escapes, and writes the same text as a `sql` literal. A text that holds a backtick is written in the double-quote form, `sql"..."`. A text that spans lines is written with the text on its own lines. The script prints each changed file and its number of rewrites, and running it twice changes nothing. Check the diff by hand.

A place the script did not rewrite, for example a string the script cannot read, is refused when the schema is emitted:

```text
PSL_VALUE_TYPE_INCOMPATIBLE: sql/expression has no cast from pg/text; write it as sql`(archived_at IS NULL)`
```

The message ends with the literal to write. When the string's text would read back from a `sql` literal as different text (it has indentation shared by every line, a blank first or last line, or a carriage return), the message ends `write it as a sql literal` instead; write the SQL in a `sql` literal, and see the next section. A number, `true` or `false` is refused the same way, an identifier is `PSL_INVALID_ATTRIBUTE_SYNTAX` (``Expected sql`...`, got an identifier``), and `pg.sql` is `PSL_UNKNOWN_LITERAL_TAG`.

`contract infer` now writes these places as `sql` literals. It skips an index, check or policy whose SQL would read back from a `sql` literal as different text, and writes a comment in its place, such as `// prisma: skipped index "users_email_active": its SQL cannot be written as a sql literal that reads back unchanged`. Write such an object by hand if you need it. `contract print` refuses such an object with `CONTRACT.PRINT_UNSUPPORTED`; write its SQL in the canonical form in the contract's source.

This supersedes the PSL `where:` example of the `postgres-full-text-search` app instructions in the upgrade from 8.0.0-rc.11 to 8.0.0-rc.12: write that predicate as ``where: sql`archived_at IS NULL` ``.

## The storage hash may change once

A `sql` literal stores its canonical text: common indentation, a blank first and last line, and carriage returns are removed. A quoted string whose text had any of these is stored differently once it is rewritten, so the contract's storage hash changes once. Index, check and policy names do not change, because their hash is computed from text with its whitespace collapsed.

After emitting the rewritten schema, run `prisma migration plan` once and commit the migration it writes. That migration has no operations; it records the new storage hash. A schema whose texts had none of these forms emits the same contract as before, and `migration plan` reports no change.
