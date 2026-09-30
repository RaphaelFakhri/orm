import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import type { OrderByItem, WhereArg } from '@internal/sql-relational-core/ast';
import { blindCast } from '@internal/utils/casts';
import type { Collection } from './collection';
import { modelOf } from './collection-contract';
import type { RowSelection, RowType } from './collection-internal-types';
import type { CollectionCoordinates, SearchableCollection } from './fulltext-search';
import { ormError } from './orm-errors';
import type {
  CollectionTypeState,
  DefaultModelRow,
  FieldExpression,
  ModelFieldCodec,
  Orderable,
  SortableFieldName,
} from './types';

type Truthy<T> = Exclude<T, false | 0 | 0n | '' | null | undefined>;

export type RowOf<C extends RowSelection<unknown>> = C[typeof RowType];

/**
 * A step for `pipe` that applies `step` only when `value` is truthy. The result keeps the input's type, so the step must not change the row.
 */
export function when<C extends RowSelection<unknown>, T>(
  value: T,
  step: (collection: C, value: Truthy<T>) => RowSelection<RowOf<C>>,
): (collection: C) => C {
  return (collection) =>
    value
      ? blindCast<C, 'a row-preserving step returns an instance of the same collection class'>(
          step(collection, blindCast<Truthy<T>, 'checked truthy above'>(value)),
        )
      : collection;
}

export interface FragmentFieldSpec {
  readonly codecId: string;
  readonly nullable: boolean;
}

export type FragmentFields = Readonly<Record<string, FragmentFieldSpec>>;

export interface FragmentState {
  readonly hasWhere: boolean;
  readonly hasOrderBy: boolean;
}

type InitialFragmentState = { readonly hasWhere: false; readonly hasOrderBy: false };

export type FragmentRow<TContract extends Contract<SqlStorage>, Fields extends FragmentFields> = {
  readonly [K in keyof Fields]: FieldExpression<
    TContract,
    Fields[K]['codecId'],
    Fields[K]['nullable']
  >;
};

type FragmentSelector<TContract extends Contract<SqlStorage>, Fields extends FragmentFields> = (
  row: FragmentRow<TContract, Fields>,
) => OrderByItem;

/**
 * What a fragment body can do with a collection: only methods that keep the row type.
 */
export interface FragmentQuery<
  TContract extends Contract<SqlStorage>,
  Fields extends FragmentFields,
  State extends FragmentState,
> {
  where(
    fn: (row: FragmentRow<TContract, Fields>) => WhereArg,
  ): FragmentQuery<
    TContract,
    Fields,
    { readonly hasWhere: true; readonly hasOrderBy: State['hasOrderBy'] }
  >;
  orderBy(
    selection:
      | FragmentSelector<TContract, Fields>
      | ReadonlyArray<FragmentSelector<TContract, Fields>>,
  ): FragmentQuery<
    TContract,
    Fields,
    { readonly hasWhere: State['hasWhere']; readonly hasOrderBy: true }
  >;
  limit(n: number): FragmentQuery<TContract, Fields, State>;
  offset(n: number): FragmentQuery<TContract, Fields, State>;
}

type FieldMismatch<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
  Fields extends FragmentFields,
> = {
  [K in keyof Fields & string]: K extends keyof DefaultModelRow<TContract, ModelName, NsId>
    ? ModelFieldCodec<TContract, ModelName, K, NsId> extends {
        readonly codecId: Fields[K]['codecId'];
        readonly nullable: Fields[K]['nullable'];
      }
      ? never
      : K
    : K;
}[keyof Fields & string];

type FragmentCheck<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
  Fields extends FragmentFields,
> = [FieldMismatch<TContract, ModelName, NsId, Fields>] extends [never]
  ? unknown
  : { readonly fragmentFieldMissing: FieldMismatch<TContract, ModelName, NsId, Fields> };

/**
 * A fragment applied with `pipe`. The result has the caller's collection type.
 */
export type CollectionFragment<
  TContract extends Contract<SqlStorage>,
  Fields extends FragmentFields,
> = <C extends SearchableCollection, ModelName extends string, NsId extends string = never>(
  collection: C &
    CollectionCoordinates<TContract, ModelName, NsId> &
    FragmentCheck<TContract, ModelName, NsId, Fields>,
) => C;

type WithFragmentState<S extends CollectionTypeState, Out extends FragmentState> = Omit<
  S,
  'hasWhere' | 'hasOrderBy'
> & {
  readonly hasWhere: Out['hasWhere'] extends true ? true : S['hasWhere'];
  readonly hasOrderBy: Out['hasOrderBy'] extends true ? true : S['hasOrderBy'];
};

/**
 * The same fragment, but the result is a plain `Collection` whose type state records what the fragment did.
 */
export type StateFragment<
  TContract extends Contract<SqlStorage>,
  Fields extends FragmentFields,
  Out extends FragmentState,
> = <
  C extends SearchableCollection,
  ModelName extends string,
  Row,
  S extends CollectionTypeState,
  NsId extends string = never,
>(
  collection: C &
    CollectionCoordinates<TContract, ModelName, NsId> &
    FragmentCheck<TContract, ModelName, NsId, Fields> &
    Collection<TContract, ModelName, Row, S>,
) => Collection<TContract, ModelName, Row, WithFragmentState<S, Out>>;

interface RuntimeCollection extends SearchableCollection {
  readonly ctx: SearchableCollection['ctx'] & {
    readonly context: {
      readonly codecDescriptors: {
        descriptorFor(codecId: string): { readonly traits: readonly string[] } | undefined;
      };
    };
  };
}

interface RuntimeField {
  readonly nullable: boolean;
  readonly type: { readonly kind: string; readonly codecId?: string };
}

function runtimeField(collection: SearchableCollection, name: string): RuntimeField | undefined {
  const model = modelOf(
    collection.ctx.context.contract,
    collection.namespaceId,
    collection.modelName,
  );
  const fields = blindCast<Record<string, RuntimeField> | undefined, 'domain model fields'>(
    model?.fields,
  );
  return fields?.[name];
}

function assertFragmentFields(collection: SearchableCollection, fields: FragmentFields): void {
  for (const [name, spec] of Object.entries(fields)) {
    const field = runtimeField(collection, name);
    if (field?.type.codecId !== spec.codecId || field.nullable !== spec.nullable) {
      throw ormError(
        'ORM.FIELD_UNKNOWN',
        `Fragment needs field "${name}" (${spec.codecId}${spec.nullable ? ', nullable' : ''}) on model ${collection.modelName}`,
        { meta: { model: collection.modelName, field: name } },
      );
    }
  }
}

function applyFragment<TContract extends Contract<SqlStorage>, Fields extends FragmentFields>(
  fields: Fields,
  body: (
    query: FragmentQuery<TContract, Fields, InitialFragmentState>,
  ) => FragmentQuery<TContract, Fields, FragmentState>,
): <C extends SearchableCollection>(collection: C) => C {
  return (collection) => {
    assertFragmentFields(collection, fields);
    const query = blindCast<
      FragmentQuery<TContract, Fields, InitialFragmentState>,
      'a collection offers where, orderBy, limit and offset with these runtime shapes'
    >(collection);
    return blindCast<
      typeof collection,
      'where, orderBy, limit and offset return an instance of the same collection class'
    >(body(query));
  };
}

/**
 * Define a fragment for any model that has the named fields: `fragment<Contract>()(fields, body)`.
 */
export function fragment<TContract extends Contract<SqlStorage>>() {
  return <const Fields extends FragmentFields, Out extends FragmentState>(
    fields: Fields,
    body: (
      query: FragmentQuery<TContract, Fields, InitialFragmentState>,
    ) => FragmentQuery<TContract, Fields, Out>,
  ): CollectionFragment<TContract, Fields> => applyFragment(fields, body);
}

/**
 * Like `fragment`, but the result's type state records the fragment's `where` and `orderBy`.
 */
export function stateFragment<TContract extends Contract<SqlStorage>>() {
  return <const Fields extends FragmentFields, Out extends FragmentState>(
    fields: Fields,
    body: (
      query: FragmentQuery<TContract, Fields, InitialFragmentState>,
    ) => FragmentQuery<TContract, Fields, Out>,
  ): StateFragment<TContract, Fields, Out> =>
    blindCast<StateFragment<TContract, Fields, Out>, 'the runtime returns the same collection'>(
      applyFragment(fields, body),
    );
}

/**
 * A step for one model that may change the row. It takes a collection of that model in any state.
 */
export type RowFragment<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  Result,
> = <C extends SearchableCollection, NsId extends string = never>(
  collection: C & CollectionCoordinates<TContract, ModelName, NsId>,
) => Result;

/**
 * Define a step for one model that may change the row: `rowFragment<Contract, 'Post'>()((c) => c.select('id'))`.
 */
export function rowFragment<TContract extends Contract<SqlStorage>, ModelName extends string>() {
  return <Result>(
    body: (collection: Collection<TContract, ModelName>) => Result,
  ): RowFragment<TContract, ModelName, Result> =>
    (collection) =>
      body(
        blindCast<
          Collection<TContract, ModelName>,
          'a collection of this model in any state has the same runtime methods'
        >(collection),
      );
}

export type SortDirection = 'asc' | 'desc';

/**
 * Turn a sort field name from a request into an `orderBy` selector. Unknown or unsortable names throw.
 */
export function sortField<
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  const Allowed extends SortableFieldName<TContract, ModelName, NsId>,
  NsId extends string = never,
>(
  collection: C & CollectionCoordinates<TContract, ModelName, NsId>,
  name: string,
  direction: SortDirection = 'asc',
  allowed?: readonly Allowed[],
): (row: { readonly [K in Allowed]: Orderable }) => OrderByItem {
  const allowedNames: readonly string[] | undefined = allowed;
  const field = runtimeField(collection, name);
  const traits =
    field?.type.codecId === undefined
      ? []
      : (blindCast<RuntimeCollection, 'every collection context carries codec descriptors'>(
          collection,
        ).ctx.context.codecDescriptors.descriptorFor(field.type.codecId)?.traits ?? []);
  if (!traits.includes('order') || (allowedNames !== undefined && !allowedNames.includes(name))) {
    throw ormError('ORM.ARGUMENT_INVALID', `Cannot sort ${collection.modelName} by "${name}"`, {
      meta: { model: collection.modelName, field: name },
    });
  }
  return (row) =>
    blindCast<Record<string, Orderable>, 'the name was checked against the model above'>(row)[
      name
    ]![direction]();
}
