---
changes:
  - id: sql-with-a-line-comment-gets-a-new-wire-name
    summary: |
      An index, check or policy whose SQL body contains both `--` and a line break gets a new name in `contract.json` once, and a policy's stored `using` or `withCheck` body changes with it. The next `migration plan` renames or recreates the object.
    detection:
      glob: "**/contract.json"
      matches:
        - '"[^"]*--[^"]*\\n|"[^"]*\\n[^"]*--'
---

# Line comments in raw SQL are safe

## SQL with a line comment gets a new wire name

Prisma names an index, check or policy after a hash of its SQL body. Before hashing, it normalizes the body. A body that contains `--` now keeps its line breaks, because a line break ends the comment and so changes what the body means. Every other body normalizes as before.

This affects an index expression or predicate, a check expression, or a policy `using` or `withCheck` that contains both `--` and a line break. For such an object, re-emitting the contract changes:

- the stored index, check or policy name in `contract.json`;
- for a policy, the stored `using` or `withCheck` body in `contract.json`. The old stored body had its line breaks collapsed into spaces, so everything after the first `--` was part of the comment.

Re-emit the contract and run `migration plan`. The planned migration renames or recreates each affected object once.
