# Handover: collection scopes and query fragments (prisma/orm)

Written 2026-09-30 by the session named prometheus-67, for an agent starting in a fresh session and a fresh worktree.

## Context you can read

- **Full transcript of the previous session:** `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-postgres-fts-follow-ups-c8df45/39bcce7e-6534-4f35-973d-b39a460ed895.jsonl`. It is about 20 MB of JSON lines. Do not read it whole. Search it with `grep` for a topic, or read the last few hundred lines for the most recent turns.
- **Session link:** `claude://claude.ai/epitaxy/local_dbfb4b1a-a8af-45c4-891b-fc2a3bcef1ea`
- **This file** lives on the branch `collection-scopes-handover` on the `bot` remote. That branch is `model-scopes-design` plus this file only.

## What the work is

Two linked design threads for the Prisma 8 SQL ORM client (`packages/3-extensions/sql-orm-client`):

1. **Collection scopes for kinds of index.** Let a package that introduces a kind of index (first case: Postgres full-text search over several weighted fields) give applications a typed, chainable search built from the index's own definition, so the query cannot miss the index.
2. **`pipe` and query fragments.** Serhii's suggestion: a general `pipe(fn)` on collections, so users can pass query fragments around as functions, replacing the Prisma 7 habit of passing query objects (`where`, `orderBy`, `select`) around.

No production code exists for either. Everything is design documents and throwaway spikes.

## Where things are

| What | Where |
| --- | --- |
| Design PR (draft) | https://github.com/prisma/orm/pull/30428, branch `model-scopes-design`, tip `6250ecaba2` |
| ADR (Proposed) | `docs/architecture docs/adrs/ADR 257 - Packages offer collection scopes for their kinds of index.md` on that branch |
| Project spec (out of date) | `projects/collection-scopes/spec.md` on that branch. It still describes an earlier design with a `scopes` block in the schema. Rewrite it once the ADR is settled. |
| Spike 1: types for scopes on every collection | branch `spike-collection-scope-types`, `projects/collection-scopes/spikes/type-composition.md` (also on the PR branch) |
| Spike 2: scopes declared in the contract | branch `spike-collection-scope-declared`, `projects/collection-scopes/spikes/declared-scopes.md` (also on the PR branch) |
| Spike 3: forms of the scope helper | branch `spike-scope-helper-api`, `projects/collection-scopes/spikes/helper-api-options.md` |
| Spike 4: how a package author types a helper | branch `spike-scope-helper-authoring`, `projects/collection-scopes/spikes/helper-authoring.md` |
| Spike 5: `pipe`, `when` and fragments | branch `spike-pipe-fragments`, `projects/collection-scopes/spikes/pipe-fragments.md` |
| Bug found by spike 5 | Linear TML-3397 (Triage, High): a ternary between two collections can allow `deleteAll()` on an unfiltered collection |

All branches are on the `bot` remote. Spike code is throwaway. Keep only the write-ups.

## Current design of ADR 257

```ts
class PostCollection extends Collection<Contract, 'Post'> {
  #searchScopes = fulltextSearchScopes(this);
  search(q: TsqueryArgument) {
    return this.#searchScopes.post_search(q);
  }
}
```

- The schema declares an index: `@@fullTextIndex([[title, subtitle], body], name: "post_search")`. Nested lists share a weight; earlier groups weigh more.
- A package exports a scope helper. It takes any collection and returns one scope per index of its kind on that model, named after the index. Each scope returns the same collection type.
- The ORM client provides a builder, `defineIndexScopes`. The package author writes an ordinary function returning a filter and a default order. A three-line interface is needed only when an argument's type depends on the index.
- No change to the schema grammar, the contract's domain plane, or the `Collection` type.

**Written into the ADR without Will's confirmation** (he has not objected; confirm or change when he next reviews):

1. After a scope, `update` and `delete` are allowed, but `cursor` is not.
2. The scope's order is a default that `orderBy` replaces.
3. One builder name, `defineIndexScopes`, for both one operation (form A) and several (form B). The spikes built separate functions; combining them is untested.
4. The full-text example needs no type-level code.
5. `@@fullTextIndex` takes weight groups, and `name:` is the scope's name.

## Rulings Will made (do not reopen)

- The contract must not describe the ORM client. The ORM is an interchangeable query interface.
- No fixed-value "kind" fields on generic concepts: extensions could not extend them.
- Constructing a client must need no extra type arguments, and contributions from any package, including third-party extensions, must be fully typed.
- Scopes placed directly on the collection (`db.Post.search`) are rejected for their type-checking cost.
- A scope is user-defined, as in Rails. Do not over-emphasise indexes.
- Scopes declared in the schema are parked as a possible later step.
- The helper form is an object with one member per index (form A or B), not one function taking the index name. Keeping the result in a private field is a valid use.
- `pipe` must be able to chain any collection method, like a method on a custom collection class.
- A model's default scope, as in Rails, is a separate feature.

## Open: waiting on Will

**The `pipe` spike recommendation** (spike 5), not yet answered:

- Add `pipe`, typed with a `this` parameter: +608 type instantiations in the demo when unused, about 7 per call.
- Add a `when(value, step)` method for conditional steps: +610 unused, about 90 per use. It is the sound way to write conditional queries; a ternary is unsound in two cases (TML-3397).
- Add `FieldExpression<Contract, codecId, nullable>`, a field type named by codec, so a plain function can filter any model with that field (for example soft delete).
- Add `rowFragment` and `RowOf` for shared `select`/`include` sets.
- Add `sortField` for a sort field taken from a request string.
- Do not add a general `fragment` builder yet, and do not make `where(undefined)` skip a step.
- Record this in its own ADR, separate from ADR 257.

Research on Prisma 7 usage (in the transcript, near the end) ranked the idioms: conditional `where` objects built from request values first, then fixed filters such as `deletedAt: null` repeated by hand, then shared `select`/`include` sets, then sort fields from the request.

## Next steps

1. Get Will's answer on the `pipe` recommendation, then write its ADR.
2. Get Will's review of ADR 257, including the five unconfirmed points.
3. Rewrite `projects/collection-scopes/spec.md` to match the settled ADR, then plan slices with the Drive process.
4. After acceptance, delete the spike branches.
5. In the new session, bind PR #30428 and turn on Auto-fix for it (the CI monitor is per session).

## How Will works (also in global CLAUDE.md and project memory)

- Reply in short, plain English. Take a position with reasons; do not hand him lists of bare decisions. Never use the question UI.
- When he says "discuss", discuss; write documents only when asked.
- ADR reviews: read as a teammate without context, open with a grounding example, lead with the decision, end with alternatives, no ticket numbers or past states. Give the analysis in chat, then rewrite.
- Git: push to the `bot` remote only; commit with `git commit -s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`; no AI attribution lines; never amend, rebase or force-push; run node, pnpm and commits through `mise exec --`.
- Put `Agent: <name>` at the end of every PR description you write.
