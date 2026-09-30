import type {
  AuthoringFieldNamespace,
  AuthoringTypeNamespace,
} from '@internal/framework-components/authoring';
import {
  temporalAuthoringPresets,
  temporalCodecPreset,
} from '@internal/framework-components/authoring';
import {
  SQLITE_BIGINT_CODEC_ID,
  SQLITE_BLOB_CODEC_ID,
  SQLITE_DATETIME_CODEC_ID,
  SQLITE_INTEGER_CODEC_ID,
  SQLITE_JSON_CODEC_ID,
  SQLITE_REAL_CODEC_ID,
  SQLITE_TEXT_CODEC_ID,
} from './codec-ids';

/**
 * The base PSL scalars as zero-arg type constructors in the unified authoring
 * channel, with explicit `nativeType` values pinned to the codec manifests
 * (`codecLookup.targetTypesFor(codecId)[0]`).
 *
 * The type position is the only storage decider: a mutation-default generator
 * (`@default(uuid())`) never re-picks a column's storage.
 */
export const sqliteScalarAuthoringTypes = {
  String: {
    kind: 'typeConstructor',
    documentation: 'Variable-length text stored as SQLite text.',
    output: { codecId: SQLITE_TEXT_CODEC_ID, nativeType: 'text' },
  },
  Int: {
    kind: 'typeConstructor',
    documentation: 'An integer stored as SQLite integer and represented as a JavaScript number.',
    output: { codecId: SQLITE_INTEGER_CODEC_ID, nativeType: 'integer' },
  },
  BigInt: {
    kind: 'typeConstructor',
    documentation: 'An integer stored as SQLite integer and represented as a JavaScript bigint.',
    output: { codecId: SQLITE_BIGINT_CODEC_ID, nativeType: 'integer' },
  },
  Float: {
    kind: 'typeConstructor',
    documentation: 'A floating-point number stored as SQLite real.',
    output: { codecId: SQLITE_REAL_CODEC_ID, nativeType: 'real' },
  },
  Decimal: {
    kind: 'typeConstructor',
    documentation: 'A decimal value stored and represented as text to preserve precision.',
    output: { codecId: SQLITE_TEXT_CODEC_ID, nativeType: 'text' },
  },
  DateTime: {
    kind: 'typeConstructor',
    documentation: 'A date and time stored as SQLite text.',
    output: { codecId: SQLITE_DATETIME_CODEC_ID, nativeType: 'text' },
  },
  Json: {
    kind: 'typeConstructor',
    documentation: 'A JSON value serialized to SQLite text.',
    output: { codecId: SQLITE_JSON_CODEC_ID, nativeType: 'text' },
  },
  Bytes: {
    kind: 'typeConstructor',
    documentation: 'Binary data stored as a SQLite blob.',
    output: { codecId: SQLITE_BLOB_CODEC_ID, nativeType: 'blob' },
  },
} as const satisfies AuthoringTypeNamespace;

export const sqliteAuthoringTypes = {
  BigIntNumber: {
    kind: 'typeConstructor',
    documentation:
      'A SQLite integer represented as a JavaScript number within its safe integer range.',
    output: {
      codecId: 'sqlite/bigintnumber@1',
      nativeType: 'integer',
    },
  },
  ...sqliteScalarAuthoringTypes,
} as const satisfies AuthoringTypeNamespace;

export const sqliteAuthoringFieldPresets = {
  temporal: {
    .../* @__PURE__ */ temporalAuthoringPresets({
      codecId: 'sqlite/datetime@1',
      nativeType: 'text',
    }),
    datetime: /* @__PURE__ */ temporalCodecPreset({
      codecId: 'sqlite/datetime@1',
      nativeType: 'text',
    }),
  },
} as const satisfies AuthoringFieldNamespace;
