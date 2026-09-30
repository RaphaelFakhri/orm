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
  - id: spec-contexts-carry-data-types
    summary: |
      `BlockSpecContext` gains `dataTypes`, and `interpretExtensionBlocks` takes a required `dataTypes`. `ControlDefaultRegistries` is deleted: an attribute spec context, `createBinder` and the Mongo PSL interpreter take `defaultFunctionRegistry` directly.
    detection:
      glob: "**/*.{ts,mts,cts}"
      matches:
        - '\b(BlockSpecContext|ControlDefaultRegistries|interpretExtensionBlocks|interpretExtensionBlockAttributes)\b'
        - 'controlMutationDefaults:\s*\{\s*defaultFunctionRegistry'
  - id: supabase-contract-writes-sql-literals
    summary: |
      The Supabase pack's `contract.prisma` writes its index and check SQL as `sql` literals. Its `contract.json` does not change.
    detection:
      glob: "**/*.prisma"
      matches:
        - '@@index\([^)]*where:\s*"'
---

# Raw SQL in PSL is a `sql` literal

Placeholder written by slice 2b dispatch (b). Dispatch (d) writes the instructions, the codemod reference (`script: ./scripts/rewrite-sql-strings.mjs`) and its copy, and validates them by execution.

## The storage hash may change once

Placeholder for dispatch (d).

## Spec contexts carry the stack's data types

Placeholder for dispatch (d).

## The Supabase contract writes `sql` literals

Placeholder for dispatch (d).
