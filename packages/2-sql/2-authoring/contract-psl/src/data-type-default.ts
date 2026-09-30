/**
 * Reading a `@default(...)` value: a written value is read by the authoring entry for the syntax it
 * is written in, which gives it a data type; the column's type takes it directly or through a cast;
 * and the column's codec validates the canonical form before it is stored.
 *
 * No per-type code and no per-codec branch live here. ADR 254.
 */

import type { JsonValue } from '@internal/contract/types';
import {
  type CastRefusal,
  castTypedValue,
  type DataTypeSupport,
  describeAdmittedForms,
  describeRefusal,
  type ReadRefusal,
  readWrittenValue,
  type TypedValue,
  type WrittenScalar,
  type WrittenValue,
} from '@internal/framework-components/authoring';
import type { CodecLookup, DataTypeId } from '@internal/framework-components/codec';
import { materializeCodec } from '@internal/framework-components/codec';
import type { ContributedPslDiagnosticCode } from '@internal/framework-components/psl-ast';
import { blindCast } from '@internal/utils/casts';
import { ifDefined } from '@internal/utils/defined';
import { InternalError } from '@internal/utils/internal-error';

/** A written value the column's codec refuses. */
export const PSL_INVALID_DEFAULT_LITERAL: ContributedPslDiagnosticCode =
  'PSL_INVALID_DEFAULT_LITERAL';

/** A single value written as the default of a column that holds a list. */
export const PSL_DEFAULT_LIST_EXPECTED: ContributedPslDiagnosticCode = 'PSL_DEFAULT_LIST_EXPECTED';

export interface DefaultColumn {
  readonly codecId: string;
  readonly typeParams?: Record<string, unknown> | undefined;
}

/**
 * Why a default was refused, in parts, so each contract source words its own diagnostic: the cast
 * rule's refusals, plus the refusals only a default has.
 */
export type DefaultRefusal = {
  /** Which element of a written list the refusal is about; `undefined` for the whole value. */
  readonly elementIndex: number | undefined;
} & (
  | ReadRefusal
  | CastRefusal
  | { readonly kind: 'not-a-list' }
  | {
      readonly kind: 'no-list-cast';
      readonly receivingType: DataTypeId;
      readonly casts: readonly string[];
    }
  | { readonly kind: 'undecodable'; readonly codecId: string; readonly message: string }
);

export type ReadDefaultResult =
  | { readonly ok: true; readonly value: JsonValue }
  | {
      readonly ok: false;
      readonly refusal: DefaultRefusal;
      /** The types whose written forms a diagnostic suggests instead. */
      readonly receivingTypes: readonly DataTypeId[];
    };

type DefaultFailure = Extract<ReadDefaultResult, { readonly ok: false }>;

/**
 * Where a refused default is reported: a cast-rule refusal at the written value, or the element of
 * a written list it is about; a refusal only defaults have at the `@default` attribute.
 */
export type DefaultRefusalPlace =
  | { readonly kind: 'written-value'; readonly elementIndex: number | undefined }
  | { readonly kind: 'attribute' };

export type LowerDefaultResult =
  | { readonly ok: true; readonly value: JsonValue }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly place: DefaultRefusalPlace;
    };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function refused(refusal: DefaultRefusal, receivingTypes: readonly DataTypeId[]): DefaultFailure {
  return { ok: false, refusal, receivingTypes };
}

function readOneValue(
  dataTypes: DataTypeSupport,
  written: WrittenScalar,
  elementIndex: number | undefined,
  receivingTypes: readonly DataTypeId[],
): { readonly ok: true; readonly typed: TypedValue } | DefaultFailure {
  const read = readWrittenValue(dataTypes, written);
  return read.ok
    ? { ok: true, typed: read.value }
    : refused({ ...read.failure, elementIndex }, receivingTypes);
}

/** The column's `typeParams` as the codec reference carries them, so `vector(3)` checks its length. */
function codecRefTypeParams(
  typeParams: Record<string, unknown> | undefined,
): JsonValue | undefined {
  return typeParams === undefined
    ? undefined
    : blindCast<JsonValue, 'typeParams are read from PSL and validated by the codec paramsSchema'>(
        typeParams,
      );
}

/**
 * Read one `@default(...)` value for a column, refusing in parts so each contract source words its
 * own diagnostic. `isList` selects the check: a list column's elements are each read and cast
 * against the element codec's data type, while a scalar column takes a written list only through
 * its type's list cast — which is how `pgvector.Vector(3) @default([0.1, 0.2])` is read.
 */
export function readDataTypeDefault(input: {
  readonly written: WrittenValue;
  readonly isList: boolean;
  readonly column: DefaultColumn;
  readonly codecLookup: CodecLookup | undefined;
  readonly dataTypes: DataTypeSupport;
  readonly fieldPath: string;
}): ReadDefaultResult {
  const descriptorFor = input.codecLookup?.descriptorFor;
  if (descriptorFor === undefined) {
    throw new InternalError(
      `Field "${input.fieldPath}": the codec lookup resolving column codecs exposes no descriptorFor, but the column was resolved from a codec descriptor.`,
    );
  }
  const descriptor = descriptorFor(input.column.codecId);
  if (descriptor === undefined) {
    throw new InternalError(
      `Field "${input.fieldPath}": no codec descriptor is registered for "${input.column.codecId}", but the column was resolved from one.`,
    );
  }
  const columnType = descriptor.dataType;
  const receivingTypes = [columnType];

  const codec = materializeCodec(
    descriptor,
    {
      codecId: input.column.codecId,
      ...ifDefined('typeParams', codecRefTypeParams(input.column.typeParams)),
    },
    { name: input.fieldPath },
  );
  const validate = (value: JsonValue, elementIndex: number | undefined): ReadDefaultResult => {
    try {
      codec.decodeJson(value);
      return { ok: true, value };
    } catch (error) {
      return refused(
        {
          kind: 'undecodable',
          codecId: input.column.codecId,
          message: messageOf(error),
          elementIndex,
        },
        receivingTypes,
      );
    }
  };

  const readOne = (written: WrittenScalar, elementIndex: number | undefined): ReadDefaultResult => {
    const read = readOneValue(input.dataTypes, written, elementIndex, receivingTypes);
    if (!read.ok) return read;
    const cast = castTypedValue(input.dataTypes, columnType, read.typed);
    if (!cast.ok) return refused({ ...cast.failure, elementIndex }, receivingTypes);
    return validate(cast.value.value, elementIndex);
  };

  if (input.written.kind !== 'list') {
    if (input.isList) {
      return refused({ kind: 'not-a-list', elementIndex: undefined }, receivingTypes);
    }
    return readOne(input.written, undefined);
  }

  if (input.isList) {
    const elements: JsonValue[] = [];
    for (const [elementIndex, written] of input.written.elements.entries()) {
      if (written.kind === 'list') return nestedList(elementIndex, receivingTypes);
      const element = readOne(written, elementIndex);
      if (!element.ok) return element;
      elements.push(element.value);
    }
    return { ok: true, value: elements };
  }

  return readListIntoScalar({ ...input, written: input.written, columnType, validate });
}

function nestedList(elementIndex: number, receivingTypes: readonly DataTypeId[]): DefaultFailure {
  return refused(
    { kind: 'unreadable', message: 'a list holds values, not other lists', elementIndex },
    receivingTypes,
  );
}

/** A written list on a column that is not a list: the column's type takes it through its list cast. */
function readListIntoScalar(input: {
  readonly written: Extract<WrittenValue, { kind: 'list' }>;
  readonly dataTypes: DataTypeSupport;
  readonly columnType: DataTypeId;
  readonly validate: (value: JsonValue, elementIndex: number | undefined) => ReadDefaultResult;
}): ReadDefaultResult {
  const declaration = input.dataTypes.lookup.get(input.columnType);
  const listCast = declaration?.listCast;
  if (listCast === undefined) {
    return refused(
      {
        kind: 'no-list-cast',
        receivingType: input.columnType,
        casts: Object.keys(declaration?.casts ?? {}),
        elementIndex: undefined,
      },
      [input.columnType],
    );
  }

  const elements: JsonValue[] = [];
  for (const [elementIndex, written] of input.written.elements.entries()) {
    if (written.kind === 'list') return nestedList(elementIndex, listCast.of);
    const read = readOneValue(input.dataTypes, written, elementIndex, listCast.of);
    if (!read.ok) return read;
    if (!listCast.of.includes(read.typed.type)) {
      return refused(
        {
          kind: 'no-cast',
          receivingType: input.columnType,
          valueType: read.typed.type,
          casts: [...listCast.of],
          elementIndex,
        },
        listCast.of,
      );
    }
    elements.push(read.typed.value);
  }

  try {
    return input.validate(listCast.cast(elements), undefined);
  } catch (error) {
    return refused({ kind: 'unreadable', message: messageOf(error), elementIndex: undefined }, [
      input.columnType,
    ]);
  }
}

/** Where a diagnostic is about, for a message: `Field "N.count" at element 2`. */
function location(fieldPath: string, elementIndex: number | undefined): string {
  return elementIndex === undefined
    ? `Field "${fieldPath}"`
    : `Field "${fieldPath}" at element ${elementIndex + 1}`;
}

/** What may be written where every one of `types` is received, for a message: `a number`. */
function formsOf(dataTypes: DataTypeSupport, types: readonly DataTypeId[]): string {
  return [...new Set(types.map((type) => describeAdmittedForms(dataTypes, type)))].join(' or ');
}

/** {@link readDataTypeDefault} worded as a PSL diagnostic's code and message. */
export function lowerDataTypeDefault(input: {
  readonly written: WrittenValue;
  readonly isList: boolean;
  readonly column: DefaultColumn;
  readonly codecLookup: CodecLookup | undefined;
  readonly dataTypes: DataTypeSupport;
  readonly fieldPath: string;
}): LowerDefaultResult {
  const read = readDataTypeDefault(input);
  if (read.ok) return read;
  const { refusal } = read;
  const where = location(input.fieldPath, refusal.elementIndex);
  const forms = formsOf(input.dataTypes, read.receivingTypes);
  const atWrittenValue: DefaultRefusalPlace = {
    kind: 'written-value',
    elementIndex: refusal.elementIndex,
  };
  switch (refusal.kind) {
    case 'not-a-list':
      return {
        ok: false,
        code: PSL_DEFAULT_LIST_EXPECTED,
        message: `${where}: this column holds a list, so its default is a list literal, as in [1, 2]`,
        place: { kind: 'attribute' },
      };
    case 'undecodable':
      return {
        ok: false,
        code: PSL_INVALID_DEFAULT_LITERAL,
        message: `${where}: ${refusal.message}`,
        place: { kind: 'attribute' },
      };
    case 'no-list-cast':
      return {
        ok: false,
        code: 'PSL_VALUE_TYPE_INCOMPATIBLE',
        message: `${where}: ${refusal.receivingType} has no cast from a list; write ${forms}`,
        place: atWrittenValue,
      };
    default: {
      const { code, message } = describeRefusal(refusal, forms);
      return { ok: false, code, message: `${where}: ${message}`, place: atWrittenValue };
    }
  }
}
