/**
 * Reading a `@default(...)` value: a written value is read by the authoring entry for the syntax it
 * is written in, which gives it a data type; the column's type takes it directly or through a cast;
 * and the column's codec validates the canonical form before it is stored.
 *
 * No per-type code and no per-codec branch live here. ADR 254.
 */

import type { JsonValue } from '@internal/contract/types';
import {
  castTypedValue,
  type DataTypeSupport,
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
 * Why a default was refused, in parts, so each contract source words its own diagnostic: PSL says
 * `pg/int4 has no cast from pg/int8`, and the reader for the earlier schema language says what its
 * own users need to hear.
 */
export type DefaultRefusal = {
  /** Which element of a written list the refusal is about; `undefined` for the whole value. */
  readonly elementIndex: number | undefined;
} & (
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'unknown-tag'; readonly tag: string; readonly known: readonly string[] }
  | { readonly kind: 'unwritable'; readonly syntax: string }
  | { readonly kind: 'not-a-list' }
  | {
      readonly kind: 'no-cast';
      readonly columnType: string;
      readonly valueType: string;
      readonly casts: readonly string[];
    }
  | { readonly kind: 'undecodable'; readonly codecId: string; readonly message: string }
);

export type ReadDefaultResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly refusal: DefaultRefusal };

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

function readOneValue(
  support: DataTypeSupport,
  written: WrittenScalar,
  elementIndex: number | undefined,
):
  | { readonly ok: true; readonly typed: TypedValue }
  | { readonly ok: false; readonly refusal: DefaultRefusal } {
  const read = readWrittenValue(support, written);
  return read.ok
    ? { ok: true, typed: read.value }
    : { ok: false, refusal: { ...read.failure, elementIndex } };
}

function castInto(
  support: DataTypeSupport,
  columnType: DataTypeId,
  typed: TypedValue,
  elementIndex: number | undefined,
): ReadDefaultResult {
  const cast = castTypedValue(support, columnType, typed);
  if (cast.ok) return { ok: true, value: cast.value.value };
  const refusal = cast.failure;
  return {
    ok: false,
    refusal:
      refusal.kind === 'no-cast'
        ? {
            kind: 'no-cast',
            columnType: refusal.receivingType,
            valueType: refusal.valueType,
            casts: refusal.casts,
            elementIndex,
          }
        : { ...refusal, elementIndex },
  };
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
      return {
        ok: false,
        refusal: {
          kind: 'undecodable',
          codecId: input.column.codecId,
          message: messageOf(error),
          elementIndex,
        },
      };
    }
  };

  const readOne = (written: WrittenScalar, elementIndex: number | undefined): ReadDefaultResult => {
    const read = readOneValue(input.dataTypes, written, elementIndex);
    if (!read.ok) return read;
    const cast = castInto(input.dataTypes, columnType, read.typed, elementIndex);
    if (!cast.ok) return cast;
    return validate(cast.value, elementIndex);
  };

  if (input.written.kind !== 'list') {
    if (input.isList) {
      return { ok: false, refusal: { kind: 'not-a-list', elementIndex: undefined } };
    }
    return readOne(input.written, undefined);
  }

  if (input.isList) {
    const elements: JsonValue[] = [];
    for (const [elementIndex, written] of input.written.elements.entries()) {
      if (written.kind === 'list') {
        return {
          ok: false,
          refusal: {
            kind: 'unreadable',
            message: 'a list holds values, not other lists',
            elementIndex,
          },
        };
      }
      const element = readOne(written, elementIndex);
      if (!element.ok) return element;
      elements.push(element.value);
    }
    return { ok: true, value: elements };
  }

  return readListIntoScalar({ ...input, written: input.written, columnType, validate });
}

/** A written list on a column that is not a list: the column's type takes it through its list cast. */
function readListIntoScalar(input: {
  readonly written: Extract<WrittenValue, { kind: 'list' }>;
  readonly dataTypes: DataTypeSupport;
  readonly columnType: DataTypeId;
  readonly validate: (value: JsonValue, elementIndex: number | undefined) => ReadDefaultResult;
}): ReadDefaultResult {
  const listCast = input.dataTypes.lookup.get(input.columnType)?.listCast;
  if (listCast === undefined) {
    return {
      ok: false,
      refusal: {
        kind: 'no-cast',
        columnType: input.columnType,
        valueType: 'a list',
        casts: Object.keys(input.dataTypes.lookup.get(input.columnType)?.casts ?? {}),
        elementIndex: undefined,
      },
    };
  }

  const elements: JsonValue[] = [];
  for (const [elementIndex, written] of input.written.elements.entries()) {
    if (written.kind === 'list') {
      return {
        ok: false,
        refusal: {
          kind: 'unreadable',
          message: 'a list holds values, not other lists',
          elementIndex,
        },
      };
    }
    const read = readOneValue(input.dataTypes, written, elementIndex);
    if (!read.ok) return read;
    if (!listCast.of.includes(read.typed.type)) {
      return {
        ok: false,
        refusal: {
          kind: 'no-cast',
          columnType: input.columnType,
          valueType: read.typed.type,
          casts: [...listCast.of],
          elementIndex,
        },
      };
    }
    elements.push(read.typed.value);
  }

  try {
    return input.validate(listCast.cast(elements), undefined);
  } catch (error) {
    return {
      ok: false,
      refusal: {
        kind: 'unreadable',
        message: messageOf(error),
        elementIndex: undefined,
      },
    };
  }
}

/** Where in a written list a diagnostic is about, for a message: ` at element 2`. */
function at(elementIndex: number | undefined): string {
  return elementIndex === undefined ? '' : ` at element ${elementIndex + 1}`;
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
  const where = `Field "${input.fieldPath}"${at(refusal.elementIndex)}`;
  const atWrittenValue: DefaultRefusalPlace = {
    kind: 'written-value',
    elementIndex: refusal.elementIndex,
  };
  const refuse = (code: string, message: string, place: DefaultRefusalPlace) => ({
    ok: false as const,
    code,
    message,
    place,
  });
  switch (refusal.kind) {
    case 'unreadable':
      return refuse('PSL_INVALID_LITERAL', `${where}: ${refusal.message}`, atWrittenValue);
    case 'unknown-tag':
      return refuse(
        'PSL_UNKNOWN_LITERAL_TAG',
        `Unknown literal tag "${refusal.tag}". Known tags: ${refusal.known.join(', ')}.`,
        atWrittenValue,
      );
    case 'unwritable':
      return refuse(
        'PSL_VALUE_TYPE_INCOMPATIBLE',
        `${where}: this target has no data type for a ${refusal.syntax} value`,
        atWrittenValue,
      );
    case 'not-a-list':
      return refuse(
        PSL_DEFAULT_LIST_EXPECTED,
        `${where}: this column holds a list, so its default is a list literal, as in [1, 2]`,
        { kind: 'attribute' },
      );
    case 'no-cast':
      return refuse(
        'PSL_VALUE_TYPE_INCOMPATIBLE',
        `${where}: ${refusal.columnType} has no cast from ${refusal.valueType}; ${describeCasts(refusal.casts)}`,
        atWrittenValue,
      );
    case 'undecodable':
      return refuse(PSL_INVALID_DEFAULT_LITERAL, `${where}: ${refusal.message}`, {
        kind: 'attribute',
      });
  }
}

function describeCasts(casts: readonly string[]): string {
  return casts.length === 0 ? 'it casts from nothing' : `it casts from ${casts.join(', ')}`;
}
