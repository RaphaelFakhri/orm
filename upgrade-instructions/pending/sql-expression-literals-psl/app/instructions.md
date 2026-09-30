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

Placeholder written by slice 2b dispatch (b). Dispatch (d) writes the instructions, the before-and-after table, the codemod reference (`script: ./scripts/rewrite-sql-strings.mjs`) and its copy, and validates them by execution.

## The storage hash may change once

Placeholder. Dispatch (d) writes this section: run `migration plan` once and commit the migration, which has no operations.
