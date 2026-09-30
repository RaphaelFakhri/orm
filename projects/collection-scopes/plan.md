# Plan: query fragments, collection scopes and weighted full-text search

**Spec:** [spec.md](spec.md). **Linear project:** none yet; issue IDs are filled in when it exists.

## Slices

### 1. Sound conditional collections and `pipe`

**Outcome.** `Collection` has `pipe`. A filtered collection is a subtype of an unfiltered one, so any function body inside `pipe`, a ternary, or `let` with `if` yields a sound type. TML-3397 is closed.

**Builds on:** nothing. **Hands to:** slices 2 and 4 a `Collection` with `pipe` and the structural state.

- `DefaultCollectionTypeState` flags become `boolean`; the state is a declared property of `Collection`.
- `pipe<Self, Result>(this: Self, step: (collection: Self) => Result): Result`.
- Type tests for every site and every control-flow form in the spec; a regression test for TML-3397.
- Upgrade instruction for the `DefaultCollectionTypeState` change.
- Spike reference: `bot/spike-collection-state-subtyping`, write-up `spikes/state-subtyping.md`.

### 2. Fragment helpers

**Outcome.** `FieldExpression`, `rowFragment`, `RowOf` and `sortField` are exported from the ORM client and the Postgres facade. The missing-field error for a row fragment names the field.

**Builds on:** slice 1. **Hands to:** the demo and docs a complete fragment surface.

- `FieldExpression<Contract, CodecId, Nullable>` in `types.ts`, built from the same parts as the row accessor's field type.
- `rowFragment<Contract, Model>()(body)` and `RowOf`; `sortField(collection, name, direction, allowed)` with the `order` trait check at run time.
- The demo's list query written with `pipe`, a soft-delete fragment and a sort field.
- Spike reference: `bot/spike-pipe-fragments`, write-up `spikes/pipe-fragments.md`.

### 3. Weighted full-text index as data

**Outcome.** `@@fullTextIndex` and the TypeScript `fullTextIndex` helper take fields in weight groups, the contract records fields, weights and language as data, and one renderer produces the index DDL and the query expression. `fullTextMatches` and `fullTextRank` accept weight groups in the SQL builder.

**Builds on:** nothing. Runs in parallel with slice 1. **Hands to:** slice 4 a structured index the builder can read from the contract type.

- Postgres target: `full-text-index-expression.ts`, `full-text-options.ts`, `authoring.ts`, `query-operations.ts`; the extension's `contract/full-text-index.ts`.
- Storage-hash change and its upgrade instruction; fixtures regenerated.
- Integration test: `EXPLAIN` uses the index for a query built by the renderer, with sequential scans disabled and a negative control.

### 4. Scope helpers

**Outcome.** The ORM client exports `defineIndexScopes`; the Postgres package exports `fulltextSearchScopes`; the demo searches posts across fields through a scope on a custom collection class.

**Builds on:** slices 1 and 3. **Hands to:** close-out.

- First dispatch is a type spike inside the slice: a fragment whose result is the caller's type with `hasWhere` set, at every site. Fallback per the spec if it cannot be typed.
- `defineIndexScopes({ match, operation | operations })` with the instantiated-kind form for index-dependent arguments; index lookup from the contract type and model name.
- `fulltextSearchScopes` in the Postgres target, re-exported by the facade.
- A test-only second kind of index with its own helper. A test through the built `dist` of the published packages.
- Spike references: `bot/spike-scope-helper-api`, `bot/spike-scope-helper-authoring`, write-ups `spikes/helper-api-options.md`, `spikes/helper-authoring.md`.

## Sequence

- Parallel: slice 1 and slice 3.
- Then slice 2 (after 1) in parallel with slice 4 (after 1 and 3).

## After the last slice

- Set ADR 259 and ADR 260 to Accepted in the slice that completes their examples.
- Delete the spike branches on `bot`.
- Close-out per the projects README: move anything long-lived to `docs/`, delete `projects/collection-scopes/`.
