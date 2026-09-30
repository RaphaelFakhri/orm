# Slice 2t findings

Two points where the brief or the design does not fit the code. Neither blocks the slice; each needs a decision.

## 1. The `unknown-tag` arm of `lowerDataTypeDefault` cannot simply go

The brief says: "the `unknown-tag` arm of `lowerDataTypeDefault` goes, replaced by the framework reader".

The arm exists because `lowerDataTypeDefault` switches over `DefaultRefusal`, and `DefaultRefusal` must keep `unknown-tag`: `contract-prisma7/src/defaults.ts` reads defaults through the same `readDataTypeDefault` and words that refusal itself (`refusalReason`). `readDataTypeDefault` reads through the framework's `readWrittenValue`, which returns `unknown-tag`. So the type keeps the case, and an exhaustive switch needs an arm for it.

The arm is unreachable from PSL because `psl-column-resolution.ts` checks each tag before it calls `lowerDataTypeDefault` (`readTaggedLiteral`, which uses the framework's `entryForTag` and `knownTags`).

Slice 2t leaves both as they are. The two ways to remove the dead code:

- **A (recommended).** Delete the tag check from `readTaggedLiteral`, so it only checks canonicalization. An unknown tag then reaches `lowerDataTypeDefault` through `readWrittenValue`, and its arm reports it, at the written value, with the same code and message. One place words the refusal, and the arm is live. The scalar `sql` path already calls `readWrittenValue` first, so it needs no other change.
- **B.** Keep the check in `psl-column-resolution.ts` and make the arm throw an `InternalError`. The arm stays, as an assertion.

## 2. A refusal inside a function call that is an arm of `oneOf` becomes "Expected one of"

`dataTypeValue` works as a parameter of a `funcCall` that is an arm of `oneOf`: the typed value comes back in the call's arguments (tested). But when the argument is refused, `oneOf` replaces every arm's diagnostic with `Expected one of: …` at the whole value (`one-of.ts`). So `@default(nanoid("8"))` would report `Expected one of: …`, not `pg/int4 has no cast from pg/text` at `"8"`.

The project "Data types own column types" requires general codes at the written value for default-function arguments. It will need `oneOf` to keep the diagnostics of an arm whose callee matched (for example, a `funcCall` that matched its name), or `@default` to dispatch on the callee before `oneOf`. That is that project's work; the note to its agent should say so.
