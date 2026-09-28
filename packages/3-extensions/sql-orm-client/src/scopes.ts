/**
 * The type-level half of a contribution. TypeScript has no higher-kinded types, so the operations are written against two input slots that the ORM client fills in: `index` is the literal index entry the declared scope names and `collection` is the collection type every operation returns.
 */
export interface ScopeOperationsShape {
  readonly index: unknown;
  readonly collection: unknown;
  readonly operations: object;
}

/**
 * Registry of collection scope contributions, keyed by scope type id. A contributing package adds its entry by declaration merging.
 */
// biome-ignore lint/suspicious/noEmptyInterface: contributions are added by declaration merging
export interface CollectionScopeRegistry {}

type RegistryIds = keyof CollectionScopeRegistry;

type ApplyShape<Shape, Index, Coll> = Shape & {
  readonly index: Index;
  readonly collection: Coll;
} extends { readonly operations: infer Operations }
  ? Operations
  : never;

export type AuthoredIndexName<Index> = Index extends { readonly prefix: infer P extends string }
  ? P
  : Index extends { readonly name: infer N extends string }
    ? N
    : never;

type IndexNamed<Index, Name> = Index extends unknown
  ? [AuthoredIndexName<Index>] extends [Name]
    ? Index
    : never
  : never;

type IndexOfScope<Scope, Indexes> = Scope extends {
  readonly params: { readonly index: infer Name };
}
  ? Indexes extends readonly unknown[]
    ? IndexNamed<Indexes[number], Name>
    : never
  : never;

type RegisteredTypeOf<Scope> = Scope extends { readonly type: infer Type }
  ? Type extends RegistryIds
    ? Type
    : never
  : never;

export type DeclaredScopes<Scopes, Indexes, Coll> = {
  readonly [Name in keyof Scopes as [RegisteredTypeOf<Scopes[Name]>] extends [never]
    ? never
    : Name]: ApplyShape<
    CollectionScopeRegistry[RegisteredTypeOf<Scopes[Name]>],
    IndexOfScope<Scopes[Name], Indexes>,
    Coll
  >;
};

export function authoredIndexName(index: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof index['prefix'] === 'string') return index['prefix'];
  if (typeof index['name'] === 'string') return index['name'];
  return undefined;
}
