/**
 * Data types and casts.
 *
 * A data type is a stored type made first-class. It is owned by the pack that registers it, it
 * names the one canonical form the contract stores for its values, and it declares the casts that
 * say which other types' values it takes and how. A codec is one representation of a data type.
 *
 * Casts are declared by the type that receives, never by the source, so there is at most one cast
 * for any pair and the owner of a type is the only one who decides what it takes.
 *
 * ADR 254.
 */

import type { JsonValue } from '@internal/contract/types';
import { blindCast } from '@internal/utils/casts';
import { ifDefined } from '@internal/utils/defined';
import type { Type } from 'arktype';
import { runtimeError } from './runtime-error';

/**
 * The identity of a data type: `owner/name`, with no version. A type's identity does not change;
 * what changes over time is a representation of it, which is a codec, and codec ids carry a
 * version. The two forms differ visibly so that one string never names both.
 */
export type DataTypeId = string & { readonly __dataTypeId: 'DataTypeId' };

/**
 * A pure function from the canonical form of the type it casts from to the canonical form of the
 * type that declares it. It may throw a structured error for a value it cannot convert.
 */
export type Cast = (value: JsonValue) => JsonValue;

/**
 * How a type whose single value holds several elements takes a written list: each element's type
 * must be one of `of`, and `cast` receives the elements' canonical forms in written order.
 */
export interface ListCast {
  readonly of: readonly DataTypeId[];
  readonly cast: (elements: readonly JsonValue[]) => JsonValue;
}

export interface DataType {
  readonly id: DataTypeId;
  /** An arktype object schema of the type's parameters. A type without one has no parameters. */
  readonly params?: Type<unknown>;
  /** Keyed by the id of the type each cast takes values of. */
  readonly casts: Readonly<Record<DataTypeId, Cast>>;
  readonly listCast?: ListCast;
}

export interface DataTypeSpec {
  readonly params?: Type<unknown>;
  readonly casts?: Readonly<Record<string, Cast>>;
  readonly listCast?: { readonly of: readonly string[]; readonly cast: ListCast['cast'] };
}

/** The assembled types of one stack, by id. */
export interface DataTypeLookup {
  get(id: string): DataType | undefined;
  has(id: string): boolean;
  /** Every type, in assembly order. */
  all(): readonly DataType[];
}

const DATA_TYPE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read `id` as a data type id, refusing anything that is not `owner/name` in lower case. */
export function dataTypeId(id: string): DataTypeId {
  if (!DATA_TYPE_ID.test(id)) {
    throw runtimeError(
      'CONTRACT.DATA_TYPE_ID_INVALID',
      `"${id}" is not a data type id. A data type id is "owner/name" in lower case and carries no version, as in "owner/name"; a versioned id names a codec.`,
      { id },
    );
  }
  return blindCast<DataTypeId, 'the pattern above is the whole of what a data type id is'>(id);
}

/** Declare a data type. Every id it names, its own and each cast's source, is validated here. */
export function dataType(id: string, spec: DataTypeSpec): DataType {
  const casts: Record<string, Cast> = {};
  for (const [source, cast] of Object.entries(spec.casts ?? {})) {
    casts[dataTypeId(source)] = cast;
  }
  const listCast = spec.listCast;
  return {
    id: dataTypeId(id),
    ...ifDefined('params', spec.params),
    casts,
    ...(listCast === undefined
      ? {}
      : { listCast: { of: listCast.of.map(dataTypeId), cast: listCast.cast } }),
  };
}

type SchemaProp = { readonly key: PropertyKey; readonly kind?: unknown };

function isSchemaPropList(value: unknown): value is readonly SchemaProp[] {
  return (
    Array.isArray(value) &&
    value.every(
      (prop) =>
        prop !== null && (typeof prop === 'object' || typeof prop === 'function') && 'key' in prop,
    )
  );
}

function describesObjects(schema: object): boolean {
  const extendsType: unknown = Reflect.get(schema, 'extends');
  return typeof extendsType === 'function' && extendsType.call(schema, 'object') === true;
}

function objectSchemaProps(schema: unknown): readonly SchemaProp[] | undefined {
  if (schema === null || (typeof schema !== 'object' && typeof schema !== 'function')) {
    return undefined;
  }
  if (!describesObjects(schema)) return undefined;
  const props: unknown = Reflect.get(schema, 'props');
  return isSchemaPropList(props) ? props : undefined;
}

/** The keys an arktype object schema declares, or undefined when `schema` is not one. */
export function objectSchemaKeys(schema: unknown): readonly string[] | undefined {
  return objectSchemaProps(schema)?.flatMap((prop) =>
    typeof prop.key === 'string' ? [prop.key] : [],
  );
}

/** The parameters a data type requires. */
export function requiredParamKeys(type: DataType): readonly string[] {
  return (objectSchemaProps(type.params) ?? []).flatMap((prop) =>
    prop.kind === 'required' && typeof prop.key === 'string' ? [prop.key] : [],
  );
}

export function createDataTypeLookup(types: readonly DataType[]): DataTypeLookup {
  const byId = new Map<string, DataType>(types.map((type) => [type.id, type]));
  const inOrder = [...types];
  return {
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    all: () => inOrder,
  };
}
