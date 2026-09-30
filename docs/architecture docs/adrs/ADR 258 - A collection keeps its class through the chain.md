# ADR 258 — A collection keeps its class through the chain

**Status:** Proposed
**Date:** 2026-09-30
**Builds on:** [ADR 175 — Shared ORM Collection interface](ADR%20175%20-%20Shared%20ORM%20Collection%20interface.md)

---

## At a glance

An application extends `Collection` with its own methods and registers the class with the client:

```ts
class PostCollection extends Collection<Contract, 'Post'> {
  published() { return this.where((p) => p.publishedAt.isNotNull()); }
  newestFirst() { return this.orderBy((p) => p.publishedAt.desc()); }
}

const db = orm({ runtime, context, collections: { Post: PostCollection } });
```

Those methods are available on every collection of the model, before and after other calls:

```ts
db.Post.published().newestFirst().limit(10).all();   // PostCollection & HasWhere & HasOrderBy
db.Post.where({ userId }).published();               // PostCollection & HasWhere
db.Post.include('user').published();                 // PostCollection with the row widened

const posts = search ? db.Post.published() : db.Post;  // PostCollection
await posts.deleteAll();                               // error: the collection may have no filter
```

- `where` and `orderBy` return the receiver's own type, `this`, intersected with the flag they set.
- The type state that unlocks `update`, `delete` and `cursor` lives in a declared property of the collection, and the guards read it from `this`.
- A conditional between a filtered and an unfiltered collection reduces to the unfiltered one, because the filtered one is its subtype.

## Decision

1. **The collection's type state is a declared property**, `[StateType]: State`, and the row is a declared property, `[RowType]: Row`. Methods read them from `this`.
2. **A flag that is not known to be set is `boolean`.** The default state is `{ hasWhere: boolean, hasOrderBy: boolean, hasUniqueFilter: boolean }`. A method that sets a flag sets it to `true`.
3. **A method that changes only the state returns `this` intersected with the flag it sets.** `where` returns `this & HasWhere`, `orderBy` returns `this & HasOrderBy`, where `HasWhere` is `{ readonly [StateType]: { readonly hasWhere: true } }`. `limit`, `offset`, `distinct`, `distinctOn` and `cursor` return `this`.
4. **A method that widens the row returns `this` with the row widened.** `include` returns `this & { readonly [RowType]: Row & Included }`.
5. **A method that narrows the row returns a plain `Collection`.** After `select`, the rows are no longer the model's rows, and a method written against the model's row is not safe to call. `variant` narrows the row to the variant's and returns a plain `Collection` too.
6. **Guards read the flag from `this`.** `update(data: CollectionStateOf<this>['hasWhere'] extends true ? UpdateInput : never)`; `delete(this: this & HasWhere)`.

The registered class of a related model inside an include refinement is a later decision, described under "What this does not cover".

## Why

### Class methods are the application's scopes

ADR 175 chose a chaining collection over an options bag so that an application can add domain methods to a collection class and have them take part in the chain. `published()` and `newestFirst()` are the application's scopes, and the promise is that they work wherever a collection of the model appears.

That promise needs the chain to return the class. Every chaining method returning `Collection<TContract, ModelName, Row, State>` returns the base type, and the class is gone after the first call. At run time the subclass is kept: each chained collection is built with `this.constructor`. Only the type loses it.

### Why the state is in a property, not in a type argument

A polymorphic `this` type cannot change a type argument. `where` cannot return `this` with `State` replaced by `WithWhereState<State>`. What it can do is intersect. The state only ever moves one way, from unknown to set, and intersection expresses exactly that: `{ hasWhere: boolean } & { hasWhere: true }` is `{ hasWhere: true }`. So the state lives in a declared property, and a method adds the flag it sets by intersecting `this` with an interface that holds it. Setting a flag twice adds nothing: `A & HasWhere & HasWhere` is `A & HasWhere`. `HasWhere` and `HasOrderBy` are named interfaces so that error messages print the name.

The same argument gives `include` its result. Widening the row is monotonic: `{ [RowType]: Row } & { [RowType]: Row & Included }` is the widened row. Narrowing is not, which is why `select` cannot keep the class.

### Why filtered is a subtype of unfiltered

A declared property takes part in assignability in one direction. `true` is assignable to `boolean`, and `boolean` is not assignable to `true`. So a collection with `hasWhere: true` is assignable to one with `hasWhere: boolean`, and not the reverse. Two things follow:

- **A conditional is sound.** TypeScript types `search ? c.where(...) : c` as a union and removes the member that is a subtype of another. The filtered branch goes, the unfiltered type remains, and `update` and `delete` stay refused. The same holds for an `if` with an early return, a `switch`, a loop that may run zero times, and `let q = db.Post; if (search) q = q.where(...)`. A function whose every return path filters yields the filtered type, and `update` is allowed on it.
- **A filtered collection is accepted where an unfiltered one is expected**, which a function taking `typeof db.Post` needs. An unfiltered one is refused where a filtered one is declared.

Written with the state only in method parameter types, as `update(data: State['hasWhere'] extends true ? ... : never)`, neither holds: TypeScript compares method parameters in both directions, the two collections are assignable to each other, and a conditional keeps whichever branch TypeScript met first. For a custom class, or a `where` branch against an `orderBy` branch, that is the filtered one, and `deleteAll` compiles on a collection that may have no filter.

### Why `boolean`, not `false`

With `false` as the default, `{ hasWhere: true }` and `{ hasWhere: false }` are unrelated. Every conditional keeps a real union, `let q = db.Post; q = q.where(...)` stops compiling, and a filtered collection is refused where the root type is expected. `boolean` means "not known to be set", which is what an unfiltered collection is.

## How it works

### Reading the state from `this`

```ts
export declare const StateType: unique symbol;
export declare const RowType: unique symbol;

export interface HasWhere { readonly [StateType]: { readonly hasWhere: true } }
export interface HasOrderBy { readonly [StateType]: { readonly hasOrderBy: true } }
export type CollectionStateOf<C> = C extends { readonly [StateType]: infer S } ? S : never;

class CollectionImpl<TContract, ModelName, Row, State> {
  declare readonly [StateType]: State;
  declare readonly [RowType]: Row;

  where(...): this & HasWhere;
  orderBy(...): this & HasOrderBy;
  limit(n: number): this;

  update(data: CollectionStateOf<this>['hasWhere'] extends true ? UpdateInput : never): Promise<Row | null>;
  delete(this: this & HasWhere): Promise<Row | null>;
}
```

`CollectionStateOf` is a named alias because a consumer's declaration output cannot write `this[typeof StateType]` when `StateType` is a unique symbol.

Two forms of guard work. A `this` parameter gives the clearest error, "The 'this' context of type 'PostCollection' is not assignable to method's 'this' of type 'PostCollection & HasWhere'", and cannot be bypassed by casting the argument. A conditional on the argument keeps the error "not assignable to parameter of type 'never'" and can be bypassed by a cast on the argument. Methods with an argument use the argument form; methods without one use the `this` form.

### Methods that change the row

A signature that mentions the polymorphic `this` is instantiated again for every receiver type, and `include` and `select` have large signatures. Reading the state as `CollectionStateOf<this>` in those signatures costs about four percent more type checking on the demo application. Inferring the state from a `this` parameter instead, `select<S>(this: { readonly [StateType]: S }, ...)`, is instantiated once per class type and costs nothing. `select`, `include` and `variant` are written that way.

`select` and `variant` carry a second overload without the `this` parameter, which TypeScript falls back to on a receiver whose state cannot be inferred as one type, such as a union of a filtered and an ordered collection. The fallback returns the root state, which refuses writes, so it is sound.

### Cost

Measured as type instantiations, TypeScript 5.9.3.

| | Demo application, unused | A chain of ten calls |
| --- | --- | --- |
| State as a declared property, flags `boolean` | +0.08% | unchanged |
| `this`-typed chaining on top | +0.2% | cheaper than before: 97 against 356 |
| A conditional between two collections | none | 10,000 to 14,000 once per pair of collection types, then under 10 |

A conditional makes TypeScript compare the two branch types. It caches that comparison per pair of types, so the cost grows with the number of distinct collection types that appear in conditionals, not with the number of conditionals.

## Consequences

- **Class methods chain.** `db.Post.published().newestFirst()`, `db.Post.where(...).published()` and `db.Post.include('user').published()` compile and keep the class.
- **Conditional queries are sound.** A ternary, an `if`, a loop, or a reassigned `let` never unlocks `update`, `delete` or `cursor` on a collection that may lack the filter or order. Code written that way today may compile with the wrong type.
- **After `select`, class methods are gone.** The collection produces a different row, and the type says so.
- **A conditional between two differently flagged collections keeps a union.** `flag ? db.Post.published() : db.Post.newestFirst()` is `(PostCollection & HasWhere) | (PostCollection & HasOrderBy)`. Reads, `select` and class methods work on it; writes and `cursor` are refused; `include` is not callable on it. Annotating the result with the class type reduces it.
- **The type of a plain chain prints differently.** A hover on `db.Post.where(...)` shows `CollectionImpl<...> & HasWhere` rather than `Collection<..., WithWhereState<...>>`.
- **Declaration output needs more names.** A library that exports a custom collection class with declarations on needs `CollectionImpl`, `HasWhere`, `HasOrderBy`, `StateType` and `CollectionStateOf` to be public. They are.
- **Code that reads the state off `Collection`'s type arguments sees the root state**, because the flags now live in the intersection. It reads `CollectionStateOf<C>` instead. An upgrade instruction records this.

## What this does not cover

**The registered class inside an include refinement.** In `db.User.include('posts', (posts) => posts.published())`, the collection given to the callback is the base type. Making it `PostCollection` needs the parent's type to know which class is registered for `Post`. That is known once, at `orm({ collections })`, and would have to reach every collection type: as a type argument threaded through `Collection` and the refinement types, or as a declared property the client attaches to each root collection and the `this`-typed methods pass on. It cannot work inside a class body, because a class cannot name a registry that contains itself. It changes the shared collection interface for every family and is a decision of its own.

**A run-time guard on `deleteAll` and `updateAll`.** The type guard has no run-time counterpart. That is unchanged by this decision.

## Alternatives considered

- **Keep the state in a type argument and return `Collection<..., NewState>`.** This is the shape that loses the class after one call, and that lets a conditional keep the filtered branch.
- **A checked state with `false` as the default.** Sound in the sense that no conditional keeps the filtered branch, but every conditional keeps a union, `let` reassignment fails, and a filtered collection is refused where the root type is expected.
- **A `when(value, step)` method** whose result keeps the caller's type, as a way to write conditionals without a union. It moves control flow into the query API, and each construct an application might use would need its own method. Subtyping covers every construct with one rule.
- **`where(undefined)` as a no-op** for conditional filters. It adds an overload to every `where` and `orderBy`, costing 7.5% more type checking in the client package when unused, and it covers only those two methods.
- **Reading the state as `CollectionStateOf<this>` in every row-changing signature.** Correct, and about four percent more type checking on the demo, because each such signature is rebuilt per receiver type. The inferred `this` parameter gives the same result at no cost.
- **`include` returns a plain `Collection`.** The class is lost after every include. Since `include` keeps the model's rows, the class should survive it, and the row property makes that possible by the same rule as the flags.
