declare const indexPath: unique symbol;

/** A parameter type the builder replaces with the literal value at `Path` in the matched index. */
export type IndexValue<Path extends string> = string & {
  readonly [indexPath]: readonly ['value', Path];
};

/** A parameter type the builder replaces with the union of the leaf values of the array at `Path`. */
export type IndexElement<Path extends string> = string & {
  readonly [indexPath]: readonly ['element', Path];
};

type Marked = { readonly [indexPath]: unknown };

type AtPath<T, Path extends string> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? AtPath<T[Head], Rest>
    : never
  : Path extends keyof T
    ? T[Path]
    : never;

type Leaves<T> = T extends readonly (infer Element)[] ? Leaves<Element> : T;

type Resolve<Marker, Index> = Marker extends readonly ['value', infer Path extends string]
  ? AtPath<Index, Path>
  : Marker extends readonly ['element', infer Path extends string]
    ? Leaves<AtPath<Index, Path>>
    : never;

type SubstituteValue<V, Index> = V extends { readonly [indexPath]: infer Marker }
  ? Resolve<Marker, Index>
  : V;

type SubstituteArgument<T, Index> = T extends Marked
  ? SubstituteValue<T, Index>
  : T extends object
    ? [Extract<T[keyof T], Marked>] extends [never]
      ? T
      : { [K in keyof T]: SubstituteValue<T[K], Index> }
    : T;

/** The argument list of an operation, with each index placeholder replaced by the index's literal type. */
export type SubstituteArguments<Args extends readonly unknown[], Index> = {
  [K in keyof Args]: SubstituteArgument<Args[K], Index>;
};
