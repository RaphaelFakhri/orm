---
changes:
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

# `@default` refusals point at the written value

This matters only to code that reads the location of a PSL diagnostic, or the text of an `Expected one of` message, such as a test that asserts one. Schemas and contracts do not change.

## Where the refusal is reported

`PSL_VALUE_TYPE_INCOMPATIBLE` and `PSL_INVALID_LITERAL` from `@default` used to point at the whole `@default(...)` attribute. They now point at the written value. When the message names a list element (`at element 2`), they point at that element. The codes and messages are unchanged. `PSL_DEFAULT_LIST_EXPECTED` and `PSL_INVALID_DEFAULT_LITERAL` still point at the attribute.

For `tags Int[] @default([1, "x"])`, the diagnostic `Field "Post.tags" at element 2: pg/int4 has no cast from pg/text; it casts from pg/int2` now spans `"x"`.

This supersedes the last row of the table in the pending `sql-is-a-data-type` instructions: a `sql` literal inside a list literal is reported with `PSL_VALUE_TYPE_INCOMPATIBLE` at the element, not at the `@default` attribute.

Update an assertion on the span or range of one of these diagnostics to the written value.

## `sql` is no longer offered as a list element

A `sql` literal is never a list element, so the list arm of `@default` no longer lists it. The editor stops offering `sql` inside `@default([`, and an `Expected one of` message for `@default` ends with `list of (string | number | boolean | json`...`)` instead of `list of (string | number | boolean | sql`...` | json`...`)`. A `sql` literal written inside a list is still refused by the cast rule, as before.

Update an assertion on that message to the new text.
