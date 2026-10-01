# Handover: collection chaining, query fragments and collection scopes (prisma/orm)

Written 2026-10-01 by the session named bragi-59, which took over from prometheus-67. For an agent starting in a fresh session and a fresh worktree.

## Context you can read

- **Transcript of this session (bragi-59):** `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-prometheus-67-transcript-38822b/4e95a23c-54dc-4602-9d06-65d2f2811331.jsonl`. Session link: `claude://claude.ai/epitaxy/local_948c65aa-8a6d-495b-9c7e-5f55834d2b27`.
- **Transcript of the session before it (prometheus-67):** `/Users/wmadden/.claude/projects/-Users-wmadden-Projects-prisma-orm--claude-worktrees-postgres-fts-follow-ups-c8df45/39bcce7e-6534-4f35-973d-b39a460ed895.jsonl`.
- Both are large JSON-lines files. Do not read them whole. Extract the user and assistant text blocks with a short script, or `grep` for a topic.
- **Project memory:** `project-collection-scopes-design.md` in the prisma/orm memory directory has the same state in short form.
- **This file** is on branch `collection-scopes-handover` on the `bot` remote. That branch is `model-scopes-design` plus this file.

## State in one paragraph

The work is in design. No production code exists and no slice has started. Will Madden must review the design before anything is built; he objected strongly when an implementer was started early. Two draft PRs hold the design. The first is ready for Will and his colleague Serhii to review. The second waits on the first.

## The two PRs

| PR | Branch (bot remote) | Holds | State |
| --- | --- | --- | --- |
| [prisma/orm#30543](https://github.com/prisma/orm/pull/30543) | `collection-chaining-and-fragments-design`, tip `1c01d74c43` | ADR 258 "A collection keeps its class through the chain", ADR 259 "Query fragments are functions", three spike write-ups | Draft. All checks passed at the previous commit. Waiting on review by Will and Serhii. |
| [prisma/orm#30428](https://github.com/prisma/orm/pull/30428) | `model-scopes-design`, tip `ed1ed22552` | ADR 260 "Packages offer collection scopes for their kinds of index", project spec, plan, slice 1 spec, six spike write-ups | Draft. Parked. Out of date in the places listed below. |

Auto-fix (the CI monitor) was on for both in the old session. It is per session: in the new session, bind each PR and turn Auto-fix on.

## The design, as agreed with Will

**ADR 258.** The problem: a custom collection class (`class PostCollection extends Collection<Contract, 'Post'>`) loses its methods in the types after any chained call, and a ternary between a filtered and an unfiltered collection can type as the filtered one and allow `deleteAll()`. Tickets TML-3403 and TML-3397. The fix:

- The type state and the row are declared properties on the class (`[StateType]`, `[RowType]`). Unknown flags are `boolean`, not `false`.
- A method is a step with the receiver bound. A step is `Step<In, Out> = (collection: In) => Out`. Built-in methods, class methods and steps share one vocabulary: `Filtered<Self>`, `Ordered<Self>`, `Including<Self, Rel>`.
- `where<Self>(this: Self, ...): Filtered<Self>`, `orderBy` gives `Ordered<Self>`, `limit`/`offset`/`distinct`/`cursor` give `Self`, `include` gives `Including<Self, Rel>`. `select` and `variant` return the shared `Collection` type, so class methods are gone after them.
- `pipe(step)` returns `step(this)`. It lives in ADR 258, not ADR 259.
- A filtered collection is a subtype of an unfiltered one, so a conditional reduces to the unfiltered type. Any function body is sound. No `when` combinator.
- Spiked end to end on `bot/spike-this-typed-chaining` (tip `b2b7c94d6b`): the demo checks in 9.6% fewer type instantiations than main, the client package in 18% fewer; 104 dependent packages typecheck.

**ADR 259.** A query fragment is a function. Three helpers: `FieldExpression<Contract, CodecId, Nullable>` (a row field typed by codec, so a filter fits any model with that field), `rowFragment` with `RowOf` (a shared `select`/`include`), `sortField` (a sort field from a request string, checked at run time). Will has not explicitly ruled on the three helpers; he agreed to the ADR structure.

**ADR 260 (scopes).** A scope is a `Step<Self, Filtered<Self>>` that a package builds from an index definition. `fulltextSearchScopes<Contract, 'Post'>()` returns one member per full-text index. The ORM client provides a builder, `defineIndexScopes`. First use: Postgres full-text search over weighted fields.

## Rulings Will made (do not reopen)

- `when()` or any control-flow method in the query API is unacceptable. Fix the type instead.
- Class methods must be available wherever a collection of the model appears. Treating their loss as a non-goal is wrong.
- `pipe` goes in the first slice together with the `this`-typed methods and the named facts.
- The contract must not describe the ORM client. No fixed-value "kind" fields on generic concepts. Constructing a client must need no extra type arguments.
- Scopes placed directly on every collection (`db.Post.search`) are rejected for type-checking cost. Scopes declared in the schema are parked as a possible later step.
- A scope is user-defined, as in Rails. Do not over-emphasise indexes. A model's default scope is a separate feature.
- The scope helper is an object with one member per index, not one function taking the index name.
- Do not start building until Will has reviewed the design and said so.

## What is next

1. **Wait for review of #30543** by Will and Serhii. Address their comments on the ADRs. Read each ADR as a teammate without context before pushing changes: grounding example first, decision first, alternatives last, no ticket numbers, no narration of earlier states.
2. **Then the slice 2 design discussion with Will**: the mechanism by which a package contributes scopes. Three points: confirm the `defineIndexScopes` builder form from the spike (`spikes/helper-authoring.md`); decide whether the index lookup reads the contract type argument or the collection's own type; leave searches that are not filters (MongoDB Atlas Search, vector search) as a recorded limit.
3. **Bring #30428 up to date** before that discussion. It is stale in these ways:
   - ADR 260 still says "Builds on ADR 259" for `pipe`; `pipe` and the step vocabulary are now in ADR 258. Rewrite its result types as `Step<Self, Filtered<Self>>`.
   - `projects/collection-scopes/spec.md` and `plan.md` describe four slices from before the chaining design. Rewrite: slice 1 is ADR 258 (the `this: Self` methods, named facts, `pipe`), then the fragment helpers, the weighted full-text index as data, and the scope builder.
   - `projects/collection-scopes/slices/1-sound-conditionals-and-pipe/spec.md` predates ADR 258. Rewrite it from the spike write-up `spikes/this-typed-chaining.md` (on #30543's branch).
   - The branch does not have ADR 258 or 259. Either stack it on #30543's branch or wait until #30543 merges.
4. **After Will approves**, plan and build through the Drive process: slice, then `/drive-code-review` without the walkthrough, fix, repeat, manual QA, final verification by Will.

## Known open points

- **The class of a related model inside an include refinement** (`db.User.include('posts', (posts) => posts.published())`). Still the base type. Needs the class registry from `orm({ collections })` in every collection's type. ADR 258 records it under "Later decisions". Part of TML-3403.
- **Upgrade instructions needed when ADR 258 is built:** `DefaultCollectionTypeState` flags become `boolean`; state and row are read with `CollectionStateOf` and `CollectionRowOf`, not from type arguments; `ReturnType<C['where']>` gives only `HasWhere`; `include<'x'>` with an explicit type argument gives `never`.
- **Public surface:** declaration output forces `CollectionImpl` and several type names to be exported, and a plain chain prints as `CollectionImpl<...> & HasWhere`. Raised with Will under "Where to push back" in the PR; not yet answered.
- **A slice 1 implementer was started and stopped.** Its uncommitted tests are in a nested agent worktree of the old session and are stale. Ignore them.

## Branches on the bot remote

- Design: `collection-chaining-and-fragments-design`, `model-scopes-design`, `collection-scopes-handover`.
- Spikes (throwaway code, keep only the write-ups): `spike-collection-scope-types`, `spike-collection-scope-declared`, `spike-scope-helper-api`, `spike-scope-helper-authoring`, `spike-pipe-fragments`, `spike-collection-state-subtyping`, `spike-this-typed-chaining`. Delete them after the ADRs are accepted.

## How Will works (also in global CLAUDE.md and project memory)

- Reply in short, plain English. Take a position with reasons. Never use the question UI. When he says "discuss", discuss; write documents only when asked. When he asks for something to be pushed, push it; do not start other work first.
- Git: push to the `bot` remote only; commit with `git commit -s --trailer "Signed-off-by: Will Madden <madden@prisma.io>"`; no AI attribution lines in commits or PR bodies; never amend, rebase or force-push; run node, pnpm and commits through `mise exec --`.
- Subagents run on Opus. Never run the full integration suites locally.
- Put `Agent: <name>` at the end of every PR description. PR titles have no conventional-commit prefix.
- ADR numbers move: main took 257 on 2026-09-30. Check `docs/architecture docs/adrs/` on main before relying on 258, 259 and 260.
