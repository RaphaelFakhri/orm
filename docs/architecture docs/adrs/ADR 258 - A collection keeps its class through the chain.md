# ADR 258 — A collection keeps its class through the chain

**Status:** Proposed
**Date:** 2026-09-30
**Builds on:** [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md)

---

## At a glance

An application extends `Collection` with its own query methods and registers the class with the client. The methods are the application's named queries, in the way Rails scopes are:

```ts
class PostCollection extends Collection<Contract, 'Post'> {
  published()   { return this.where((p) => p.publishedAt.isNotNull()); }
  newestFirst() { return this.orderBy((p) => p.publishedAt.desc()); }
}

const db = orm({ runtime, context, collections: { Post: PostCollection } });
```

The methods are available on every collection of posts, whatever came before in the chain:

```ts
db.Post.published().newestFirst().limit(10).all();  // still a PostCollection, known to be filtered and ordered
db.Post.where({ userId }).published();              // still a PostCollection
db.Post.include('user').published();                // still a PostCollection; each row also has a user
db.Post.select('id', 'title').published();          // error: after select the rows are no longer posts

const posts = search ? db.Post.published() : db.Post;  // a PostCollection, not known to be filtered
await posts.deleteAll();                               // error: the collection may have no filter
```

- A method that keeps the model's rows, such as `where`, `orderBy`, `limit` or `include`, returns the collection's own class.
- What the chain has established so far, a filter, an order, extra fields on each row, is added to the type as a fact. It is never taken away, and it never replaces the class.
- When the code may or may not have applied a filter, the type says the filter is not known, and the methods that need one are refused.

## Decision

A collection's type is its class plus what the chain has established. Every method either keeps that class and adds a fact, or produces a different kind of row and returns the shared `Collection` type.

| Method | Returns | Class kept | What the type gains |
| --- | --- | --- | --- |
| `where` | `this & HasWhere` | yes | a filter has been applied |
| `orderBy` | `this & HasOrderBy` | yes | an order has been applied |
| `limit`, `offset`, `distinct`, `cursor` | `this` | yes | nothing |
| `include` | `this` with the row widened | yes | each row has the included relation |
| `select` | `Collection<Contract, Model, NarrowedRow, State>` | no | a different row |
| `variant` | `Collection<Contract, Model, VariantRow, State>` | no | a different row |

The facts live in two declared properties on the class, the **type state** and the **row**:

- The type state records whether a filter, an order, or a unique filter has been applied: `{ hasWhere, hasOrderBy, hasUniqueFilter }`. A flag that has not been established is `boolean`, meaning not known; a method that establishes it sets it to `true`.
- The row records the shape of the rows the collection produces.

The methods that depend on a fact read it from `this`: `update` and `delete` require `hasWhere`, and `cursor` requires `hasOrderBy`.

What this decision does not cover is described under "Later decisions": the class of a related model inside an include refinement.

## Why the facts are added to `this`, not carried in a type argument

TypeScript's polymorphic `this` type is the only way for a base class method to return "whatever class I was called on". It has one limit: a method cannot return `this` with one of the class's type arguments changed. So if the type state were a type argument, `where` could return the class or the new state, but not both.

What a method can do is intersect. `this & HasWhere` is the class plus one property. That works because a fact only ever goes from not known to known: `{ hasWhere: boolean } & { hasWhere: true }` is `{ hasWhere: true }`. Establishing the same fact twice changes nothing, since `A & HasWhere & HasWhere` is `A & HasWhere`. The same holds for the row when `include` widens it: `{ [RowType]: Row } & { [RowType]: Row & Included }` is the widened row.

Narrowing the row is not monotonic. `select('id')` removes fields, and an intersection cannot remove anything. That is why `select` and `variant` return the shared `Collection` type. It is also the right outcome: a method written against the model's row is not safe to call on a collection that produces something else.

## Why a filtered collection is a subtype of an unfiltered one

Because the type state is a declared property, it takes part in assignability, in one direction. `true` is assignable to `boolean`; `boolean` is not assignable to `true`. So `PostCollection & HasWhere` is assignable to `PostCollection`, and not the reverse.

Two things follow.

**Conditionals are sound.** TypeScript types `search ? db.Post.published() : db.Post` as the union of the two branches, then removes any member that is a subtype of another. The filtered branch is removed and the type is `PostCollection`, with the filter not known. `deleteAll` is refused. The same reduction happens for an `if` with an early return, a `switch`, a loop that may run zero times, and `let posts = db.Post; if (search) posts = posts.published()`. A function whose every return path filters yields `PostCollection & HasWhere`, and `deleteAll` is allowed on it, which is correct.

**Functions accept what they should.** A function declared with the parameter `posts: PostCollection` accepts a filtered or ordered `PostCollection`. A function declared with `posts: PostCollection & HasWhere` refuses one that may have no filter.

This is why a flag that has not been established is `boolean` rather than `false`. With `false`, `{ hasWhere: true }` and `{ hasWhere: false }` are unrelated types. Every conditional would then keep a union, reassigning a `let` would fail, and a filtered collection would be refused where the plain class is expected.

## How it works

The two properties are keyed by unique symbols, so that they never collide with a model's field names and never show up in a row:

```ts
export declare const StateType: unique symbol;
export declare const RowType: unique symbol;

export interface HasWhere   { readonly [StateType]: { readonly hasWhere: true } }
export interface HasOrderBy { readonly [StateType]: { readonly hasOrderBy: true } }

export type CollectionStateOf<C> = C extends { readonly [StateType]: infer S } ? S : never;

export class CollectionImpl<TContract, ModelName, Row, State> {
  declare readonly [StateType]: State;
  declare readonly [RowType]: Row;

  where(...): this & HasWhere;
  orderBy(...): this & HasOrderBy;
  limit(n: number): this;

  update(data: CollectionStateOf<this>['hasWhere'] extends true ? UpdateInput : never): Promise<Row | null>;
  delete(this: this & HasWhere): Promise<Row | null>;
}
```

- `HasWhere` and `HasOrderBy` are named interfaces rather than inline object types, so that every `where` produces the same type, duplicates collapse, and error messages print the name.
- `CollectionStateOf` is a named alias because a consumer's declaration output cannot spell `this[typeof StateType]` when `StateType` is a unique symbol.
- At run time nothing changes. Each chained collection is already built with `this.constructor`, so the subclass has always been the run-time object. The type now says so.

**Guards.** A method with an argument guards it through a conditional on the argument's type, which yields the error "not assignable to parameter of type 'never'". A method without an argument guards through a `this` parameter, which yields "The 'this' context of type 'PostCollection' is not assignable to method's 'this' of type 'PostCollection & HasWhere'". The `this` form gives the clearer message; the argument form is kept where an argument exists so that a cast on the argument can still bypass the guard in tests.

**Methods that change the row.** A signature that mentions the polymorphic `this` is instantiated again for every receiver type, and `select`, `include` and `variant` have large signatures. Instead of reading the state as `CollectionStateOf<this>`, they infer it from a `this` parameter, `select<S>(this: { readonly [StateType]: S }, ...)`, which is instantiated once per class. `select` and `variant` also carry an overload without the `this` parameter for a receiver whose state is not one type, such as a union of a filtered and an ordered collection; that overload returns the root state, which refuses writes, so it is sound.

**Cost.** Measured as type instantiations, TypeScript 5.9.3, on an application with four custom collection classes:

| | When no chain is written | Per use |
| --- | --- | --- |
| The properties and `this`-typed methods | +0.3% | a ten-call chain, about 100; the same on a custom class |
| A conditional between two collections | none | 10,000 to 14,000 once per pair of collection types, then under 10 |

A conditional makes TypeScript compare the two branch types. It caches the comparison per pair of types, so the cost grows with the number of distinct collection types that appear in conditionals, not with the number of conditionals.

## Consequences

- **Class methods chain**, before and after the built-in methods, and after `include`.
- **Conditional queries are sound.** A ternary, an `if`, a loop or a reassigned `let` never unlocks `update`, `delete` or `cursor` on a collection that may lack the filter or order.
- **After `select` or `variant`, class methods are gone**, because the rows are no longer the model's.
- **A conditional between two differently flagged collections keeps a union.** `flag ? db.Post.published() : db.Post.newestFirst()` is `(PostCollection & HasWhere) | (PostCollection & HasOrderBy)`. Reads, `select` and class methods work on it; writes and `cursor` are refused; `include` is not callable on a union of two generic signatures. Annotating the result as `PostCollection` reduces it.
- **A chain on the plain `Collection` prints as an intersection.** A hover shows `CollectionImpl<...> & HasWhere` rather than a single alias.
- **Five names are part of the public surface** because declaration output needs them for any library that exports a collection class: `CollectionImpl`, `HasWhere`, `HasOrderBy`, `StateType` and `CollectionStateOf`.
- **The state is read with `CollectionStateOf<C>`**, not by extracting a type argument of `Collection`. The type argument holds the state the collection started with; the facts are in the intersection.

## Later decisions

**The class of a related model inside an include refinement.** In `db.User.include('posts', (posts) => posts.published())`, the collection given to the callback is the shared `Collection` type, not `PostCollection`. Giving it the class needs the parent's type to know which class is registered for `Post`. That is known once, at `orm({ collections })`, and would have to reach every collection type: as a type argument threaded through `Collection` and the refinement types, or as a declared property the client attaches to each root collection and the `this`-typed methods pass on. It cannot work inside a class body, because a class cannot name a registry that contains itself. It changes the shared collection interface for every family and is a decision of its own.

**A run-time guard on `deleteAll` and `updateAll`.** The type guard has no run-time counterpart.

## Alternatives considered

- **The type state as a type argument, with every method returning `Collection<TContract, Model, Row, NewState>`.** A method can return the new state or the receiver's class, not both, so the class is lost after one call. And because the state then appears only in method parameter types, which TypeScript compares in both directions, a filtered and an unfiltered collection are assignable to each other; a conditional between them keeps whichever member TypeScript met first, and `deleteAll` can compile on a collection that may have no filter.
- **A flag that has not been established is `false`.** The filtered and unfiltered types become unrelated. Every conditional keeps a union, reassigning a `let` fails, and a filtered collection is refused where the plain class is expected.
- **A `when(value, step)` method** whose result keeps the caller's type, as the way to write a conditional without a union. It moves control flow into the query API, and each construct an application might use would need its own method. Subtyping covers every construct with one rule.
- **`where(undefined)` as a no-op** for conditional filters. It adds an overload to every `where` and `orderBy`, costs about 7.5% more type checking in the client package when unused, and covers only those two methods.
- **Reading the state as `CollectionStateOf<this>` in the row-changing signatures.** Correct, and about four percent more type checking on the demo application, because each such signature is rebuilt per receiver type. Inferring the state from a `this` parameter gives the same result at no cost.
- **`include` returns the shared `Collection` type.** The class is lost after every include, although the rows are still the model's. The row property makes widening monotonic, so the class can survive by the same rule as the flags.
