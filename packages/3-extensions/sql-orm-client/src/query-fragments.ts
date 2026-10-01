import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import type { OrderByItem } from '@internal/sql-relational-core/ast';
import type { ExecutionContext } from '@internal/sql-relational-core/query-lane-context';
import { blindCast } from '@internal/utils/casts';
import type { Collection } from './collection';
import { getFieldToColumnMap, modelOf } from './collection-contract';
import type { HasRow, HasState, Step } from './collection-types';
import { ormError } from './orm-errors';
import { storageTableForContract } from './storage-resolution';
import type { DefaultModelRow, Orderable, SortableFieldName } from './types';

export type SortDirection = 'asc' | 'desc';

/**
 * A collection of `ModelName` whose rows have every field of the model: not narrowed by `select` or `variant`.
 */
export interface FullRowCollection<TContract extends Contract<SqlStorage>, ModelName extends string>
  extends HasRow<DefaultModelRow<TContract, ModelName>>,
    HasState<{ readonly variantName: undefined }> {
  readonly modelName: ModelName;
}

/** A step made by `rowFragment`: it takes a collection of the model with full rows and returns the body's result. */
export type RowFragment<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  Result,
> = Step<FullRowCollection<TContract, ModelName>, Result>;

/**
 * Define a step for one model that may change the row, such as a shared `select` and `include`. The body is typed once against the model's plain collection; the step accepts any collection of that model whose rows have every field of the model.
 *
 * ```ts
 * const summary = rowFragment<Contract, 'Post'>()((posts) => posts.select('id', 'title').include('user'));
 * db.User.include('posts', (posts) => posts.pipe(summary));
 * ```
 */
export function rowFragment<TContract extends Contract<SqlStorage>, ModelName extends string>() {
  return <Result>(
    body: Step<Collection<TContract, ModelName>, Result>,
  ): RowFragment<TContract, ModelName, Result> =>
    (collection) =>
      body(
        blindCast<
          Collection<TContract, ModelName>,
          'a collection of this model with full rows has the methods of its plain collection'
        >(collection),
      );
}

interface ModelCollection<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
> {
  readonly ctx: { readonly context: ExecutionContext<TContract> };
  readonly modelName: ModelName;
  readonly namespaceId: NsId;
  readonly tableName: string;
}

type RuntimeModelCollection = ModelCollection<Contract<SqlStorage>, string, string>;

function fieldCodecId(collection: RuntimeModelCollection, field: string): string | undefined {
  const { contract } = collection.ctx.context;
  const column =
    getFieldToColumnMap(contract, collection.namespaceId, collection.modelName)[field] ?? field;
  return storageTableForContract(contract, collection.namespaceId, collection.tableName).columns[
    column
  ]?.codecId;
}

function canOrder(collection: RuntimeModelCollection, codecId: string | undefined): boolean {
  if (codecId === undefined) return false;
  const traits: readonly string[] =
    collection.ctx.context.codecDescriptors.descriptorFor(codecId)?.traits ?? [];
  return traits.includes('order');
}

function sortableFieldNames(collection: RuntimeModelCollection): readonly string[] {
  const model = modelOf(
    collection.ctx.context.contract,
    collection.namespaceId,
    collection.modelName,
  );
  return Object.keys(model?.fields ?? {}).filter((field) =>
    canOrder(collection, fieldCodecId(collection, field)),
  );
}

function whyNotSortable(collection: RuntimeModelCollection, name: string): string {
  const { modelName } = collection;
  const model = modelOf(collection.ctx.context.contract, collection.namespaceId, modelName);
  if (model?.relations?.[name] !== undefined) {
    return `"${name}" is a relation of ${modelName}, not a field.`;
  }
  if (model?.fields?.[name] === undefined) {
    return `${modelName} has no field "${name}".`;
  }
  const codecId = fieldCodecId(collection, name);
  return canOrder(collection, codecId)
    ? `"${name}" is not one of the fields allowed for sorting.`
    : `The codec ${codecId} of ${modelName}.${name} cannot be ordered.`;
}

/**
 * An `orderBy` selector for a field named by a string, such as a sort parameter of a request. A name that is not a sortable field of the collection's model or not in `allowed`, and a direction other than `asc` or `desc`, throw `ORM.ARGUMENT_INVALID`.
 *
 * ```ts
 * db.Post.orderBy(sortField(db.Post, input.sort, input.direction, ['title', 'createdAt']));
 * ```
 */
export function sortField<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string = never,
  const Allowed extends SortableFieldName<TContract, ModelName, NsId> = SortableFieldName<
    TContract,
    ModelName,
    NsId
  >,
>(
  collection: ModelCollection<TContract, ModelName, NsId>,
  name: string,
  direction: SortDirection = 'asc',
  allowed?: readonly Allowed[],
): (row: { readonly [K in Allowed]: Orderable }) => OrderByItem {
  const { modelName } = collection;
  if (direction !== 'asc' && direction !== 'desc') {
    throw ormError('ORM.ARGUMENT_INVALID', `Cannot sort ${modelName} in direction "${direction}"`, {
      why: 'A sort direction is "asc" or "desc".',
      fix: 'Pass "asc" or "desc".',
      meta: { model: modelName, direction },
    });
  }
  const sortable = sortableFieldNames(collection);
  const allowedNames: readonly string[] = allowed ?? sortable;
  if (!sortable.includes(name) || !allowedNames.includes(name)) {
    throw ormError('ORM.ARGUMENT_INVALID', `Cannot sort ${modelName} by "${name}"`, {
      why: whyNotSortable(collection, name),
      fix: `Sort by one of: ${allowedNames.filter((field) => sortable.includes(field)).join(', ')}.`,
      meta: { model: modelName, field: name },
    });
  }
  const field = blindCast<Allowed, 'checked against the sortable fields and the allowed list'>(
    name,
  );
  return (row) => row[field][direction]();
}
