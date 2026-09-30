# Slice 2b findings

## 1. `contract print` also prints the six places, and the design does not name it

`contract print` (PR #30315) prints policies in `packages/3-targets/3-targets/postgres/src/core/psl-print/row-level-security.ts` with `JSON.stringify(policy.using)`, and prints indexes and checks through `buildIndexAttribute` and `buildCheckAttribute` in `psl-build/index-attributes.ts`, which `contract infer` shares. Design section 11.2 names only the `contract infer` printers.

What this dispatch did: `row-level-security.ts` prints `using` and `withCheck` with `printSqlExpressionLiteral`, and indexes and checks get the `sql` literal through the shared builders. Without this, `contract print` would write plain strings, which PSL now refuses.

What is open: `contract print` does not check `sqlTextReadsBack`. A contract built with the TypeScript builder can still hold a text that is not canonical (for example `"x\n"` or an indented body) until slice 3 canonicalizes TypeScript values. `contract print` would then write a `sql` literal that reads back as different text, and the printed schema would not emit the same contract.

Recommendation: `contract print` refuses such an object through its refusal mechanism (`psl-print/refusals.ts`), with a message in the style of the existing refusals, for indexes, checks and policies. Slice 3 makes every stored text canonical, so the refusal would then only fire for contracts built before slice 3. Alternatively accept the gap until slice 3 merges. This needs a decision on the refusal code and message; the dispatch did not add one.
