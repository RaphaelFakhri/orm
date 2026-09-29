import type { Contract } from '@internal/contract/types';
import type { SqlStorage } from '@internal/sql-contract/types';
import {
  type AnyExpression,
  BinaryExpr,
  ColumnRef,
  LiteralExpr,
  OrderByItem,
} from '@internal/sql-relational-core/ast';
import { blindCast } from '@internal/utils/casts';
import type { ModelTableIndexes } from './types';

export interface FullTextQuery {
  readonly kind: 'fulltext-query';
  readonly text: string;
}

export function fullTextQuery(text: string): FullTextQuery {
  return { kind: 'fulltext-query', text };
}

export interface SearchableCollection {
  readonly ctx: { readonly context: { readonly contract: Contract<SqlStorage> } };
  readonly modelName: string;
  readonly namespaceId: string;
  readonly tableName: string;
}

export interface FullTextIndexShape {
  readonly prefix: string;
  readonly type: 'gin';
  readonly options: {
    readonly fields: readonly (readonly string[])[];
    readonly language: string;
  };
}

export interface CollectionCoordinates<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
> extends SearchableCollection {
  readonly ctx: { readonly context: { readonly contract: TContract } };
  readonly modelName: ModelName;
  readonly namespaceId: NsId;
}

export type ModelFullTextIndexes<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
> = Extract<
  Extract<ModelTableIndexes<TContract, ModelName, NsId>, readonly unknown[]>[number],
  FullTextIndexShape
>;

export type FullTextIndexes<C extends SearchableCollection> = ModelFullTextIndexes<
  C['ctx']['context']['contract'],
  C['modelName'],
  C['namespaceId']
>;

export type FullTextIndexName<C extends SearchableCollection> = FullTextIndexes<C>['prefix'];

export interface FullTextSearchOptions<Index extends FullTextIndexShape> {
  readonly only?: Index['options']['fields'][number][number];
}

export type FullTextSearchFunction<Index extends FullTextIndexShape, C> = (
  query: FullTextQuery,
  options?: FullTextSearchOptions<Index>,
) => C;

export type FullTextSearchScopes<
  C,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
> = {
  readonly [Index in ModelFullTextIndexes<
    TContract,
    ModelName,
    NsId
  > as Index['prefix']]: FullTextSearchFunction<Index, C>;
};

export type FullTextSearchScopesOf<C extends SearchableCollection> = FullTextSearchScopes<
  C,
  C['ctx']['context']['contract'],
  C['modelName'],
  C['namespaceId']
>;

export interface FullTextScope<Index extends FullTextIndexShape, C> {
  readonly language: Index['options']['language'];
  fulltext(query: FullTextQuery, options?: FullTextSearchOptions<Index>): C;
}

export type FullTextScopeObjects<
  C,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
> = {
  readonly [Index in ModelFullTextIndexes<
    TContract,
    ModelName,
    NsId
  > as Index['prefix']]: FullTextScope<Index, C>;
};

interface RuntimeCollection extends SearchableCollection {
  where(filter: AnyExpression): RuntimeCollection;
  orderBy(selection: () => OrderByItem): RuntimeCollection;
}

interface RuntimeFullTextIndex {
  readonly prefix?: string;
  readonly type?: string;
  readonly options?: { readonly fields?: readonly (readonly string[])[] };
}

function runtimeFullTextIndexes(collection: SearchableCollection): readonly RuntimeFullTextIndex[] {
  const namespaces = blindCast<
    Record<string, { entries: { table: Record<string, { indexes?: RuntimeFullTextIndex[] }> } }>,
    'spike: storage namespaces are read without the typed contract'
  >(collection.ctx.context.contract.storage.namespaces);
  const indexes = namespaces[collection.namespaceId]?.entries.table[collection.tableName]?.indexes;
  return (indexes ?? []).filter((index) => index.type === 'gin' && index.options?.fields);
}

function applyFullTextSearch<C extends SearchableCollection>(
  collection: C,
  name: string,
  query: FullTextQuery,
  only: string | undefined,
): C {
  const index = runtimeFullTextIndexes(collection).find((candidate) => candidate.prefix === name);
  if (!index) {
    throw new Error(`Model ${collection.modelName} has no full-text index named ${name}`);
  }
  const field = only ?? index.options?.fields?.[0]?.[0] ?? 'id';
  const column = ColumnRef.of(collection.tableName, field);
  const runtime = blindCast<RuntimeCollection, 'spike: every collection has where and orderBy'>(
    collection,
  );
  return blindCast<C, 'where and orderBy return the same collection class'>(
    runtime
      .where(new BinaryExpr('like', column, LiteralExpr.of(`%${query.text}%`)))
      .orderBy(() => OrderByItem.desc(column)),
  );
}

export function fulltextSearchScopes<
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string = never,
>(
  collection: C & CollectionCoordinates<TContract, ModelName, NsId>,
): FullTextSearchScopes<C, TContract, ModelName, NsId> {
  const scopes: Record<string, FullTextSearchFunction<FullTextIndexShape, C>> = {};
  for (const index of runtimeFullTextIndexes(collection)) {
    const name = index.prefix ?? '';
    scopes[name] = (query, options) => applyFullTextSearch(collection, name, query, options?.only);
  }
  return blindCast<
    FullTextSearchScopes<C, TContract, ModelName, NsId>,
    'keys come from the same index list'
  >(scopes);
}

export function fulltextScopeObjects<
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string = never,
>(
  collection: C & CollectionCoordinates<TContract, ModelName, NsId>,
): FullTextScopeObjects<C, TContract, ModelName, NsId> {
  const scopes: Record<string, FullTextScope<FullTextIndexShape, C>> = {};
  for (const index of runtimeFullTextIndexes(collection)) {
    const name = index.prefix ?? '';
    scopes[name] = {
      language: blindCast<string, 'spike'>(
        blindCast<{ language?: string }, 'spike'>(index.options).language,
      ),
      fulltext: (query, options) => applyFullTextSearch(collection, name, query, options?.only),
    };
  }
  return blindCast<
    FullTextScopeObjects<C, TContract, ModelName, NsId>,
    'keys come from the same index list'
  >(scopes);
}

type NamedIndex<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
  Name,
> = Extract<ModelFullTextIndexes<TContract, ModelName, NsId>, { readonly prefix: Name }>;

export function searchFullText<
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  Name extends ModelFullTextIndexes<TContract, ModelName, NsId>['prefix'],
  NsId extends string = never,
>(
  collection: C & CollectionCoordinates<TContract, ModelName, NsId>,
  name: Name,
  query: FullTextQuery,
  options?: FullTextSearchOptions<NamedIndex<TContract, ModelName, NsId, Name>>,
): C {
  return applyFullTextSearch(collection, name, query, options?.only);
}

type FullTextSearchCheck<
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string,
  Name extends string,
  Only,
> = [Name] extends [ModelFullTextIndexes<TContract, ModelName, NsId>['prefix']]
  ? [Only] extends [FullTextSearchOptions<NamedIndex<TContract, ModelName, NsId, Name>>['only']]
    ? unknown
    : { readonly fullTextSearchFieldNotInIndex: Only }
  : { readonly fullTextIndexNotOnModel: Name };

export type FullTextSearchStep<Name extends string, Only> = <
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  NsId extends string = never,
>(
  collection: C &
    CollectionCoordinates<TContract, ModelName, NsId> &
    FullTextSearchCheck<TContract, ModelName, NsId, Name, Only>,
) => C;

export function fullTextSearch<
  C extends SearchableCollection,
  TContract extends Contract<SqlStorage>,
  ModelName extends string,
  Name extends ModelFullTextIndexes<TContract, ModelName, NsId>['prefix'],
  NsId extends string = never,
>(
  name: Name,
  query: FullTextQuery,
  options?: FullTextSearchOptions<NamedIndex<TContract, ModelName, NsId, Name>>,
): (collection: C & CollectionCoordinates<TContract, ModelName, NsId>) => C;
export function fullTextSearch<Name extends string, Only extends string | undefined = undefined>(
  name: Name,
  query: FullTextQuery,
  options?: { readonly only?: Only },
): FullTextSearchStep<Name, Only>;
export function fullTextSearch(
  name: string,
  query: FullTextQuery,
  options?: { readonly only?: string },
): <C extends SearchableCollection>(collection: C) => C {
  return (collection) => applyFullTextSearch(collection, name, query, options?.only);
}
