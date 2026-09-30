import type { AuthoringTypeNamespace } from '@internal/framework-components/authoring';
import {
  collectScalarTypeConstructors,
  instantiateAuthoringTypeConstructor,
  validateAuthoringHelperArguments,
} from '@internal/framework-components/authoring';
import { describe, expect, it } from 'vitest';
import {
  postgresAuthoringTypes,
  postgresNativeAuthoringTypes,
  postgresScalarAuthoringTypes,
} from '../src/core/authoring';
import { createPostgresBuiltinCodecLookup } from '../src/core/codec-registry';
import { CODEC_ID_BY_INFERRED_TYPE } from '../src/core/psl-infer/infer-default-codec';
import postgresTargetPack from '../src/exports/pack';

describe('the type constructors the target contributes', () => {
  it('are the target’s own, then the base scalars, then the native types, in that order', () => {
    expect(postgresTargetPack.authoring.type).toBe(postgresAuthoringTypes);
    expect(Object.keys(postgresAuthoringTypes)).toEqual([
      'BigIntNumber',
      'UnboundedInt',
      'pg',
      ...Object.keys(postgresScalarAuthoringTypes),
      ...Object.keys(postgresNativeAuthoringTypes),
    ]);
    expect(postgresAuthoringTypes).toMatchObject({
      ...postgresScalarAuthoringTypes,
      ...postgresNativeAuthoringTypes,
    });
  });

  it.each(Object.entries(postgresAuthoringTypes).filter(([name]) => name !== 'pg'))(
    'documents %s',
    (_name, descriptor) => {
      expect(descriptor).toHaveProperty('documentation', expect.stringMatching(/\S.+/));
    },
  );
});

/** Design 13.4: the constructor `contract infer` prints for each data type, where one exists today. */
const INFERRED = [
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Numeric',
  'Json',
  'Jsonb',
  'Bytes',
  'SmallInt',
  'Real',
  'Char',
  'VarChar',
  'Uuid',
  'Inet',
  'Date',
  'Time',
  'Timetz',
  'Timestamp',
  'Timestamptz',
  'pg.enum',
];

function constructorPaths(namespace: object, prefix: readonly string[] = []): string[] {
  return Object.entries(namespace).flatMap(([name, value]) =>
    value !== null && typeof value === 'object' && 'kind' in value
      ? [[...prefix, name].join('.')]
      : constructorPaths(value, [...prefix, name]),
  );
}

function constructorAt(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        current !== null && typeof current === 'object'
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      postgresAuthoringTypes,
    );
}

describe('the constructors contract infer prints', () => {
  it('are marked inferred, and no other constructor is', () => {
    const marked = constructorPaths(postgresAuthoringTypes).filter((path) => {
      const descriptor = constructorAt(path);
      return descriptor !== null && typeof descriptor === 'object' && 'inferred' in descriptor;
    });
    expect(marked.sort()).toEqual([...INFERRED].sort());
  });

  it.each(INFERRED)('%s is marked with true', (path) => {
    expect(constructorAt(path)).toHaveProperty('inferred', true);
  });
});

describe('postgresScalarAuthoringTypes', () => {
  const codecLookup = createPostgresBuiltinCodecLookup();
  const namespace: AuthoringTypeNamespace = postgresScalarAuthoringTypes;

  // The legacy scalar-type map channel (name-to-codecId, retired in TML-2985) is gone; the pinned
  // name → codecId pairs below carry the retired map's claims forward.
  const expectedScalars = [
    ['String', 'pg/text@1'],
    ['Boolean', 'pg/bool@1'],
    ['Int', 'pg/int4@1'],
    ['BigInt', 'pg/int8@1'],
    ['Float', 'pg/float8@1'],
    ['Decimal', 'pg/numeric@1'],
    ['DateTime', 'pg/timestamptz-temporal@1'],
    ['Json', 'pg/json@1'],
    ['Jsonb', 'pg/jsonb@1'],
    ['Bytes', 'pg/bytea@1'],
  ] as const;

  it('pins every base scalar as a zero-arg type constructor with its native type', () => {
    expect(Object.keys(namespace).sort()).toEqual(expectedScalars.map(([name]) => name).sort());
    for (const [name, codecId] of expectedScalars) {
      expect(namespace[name]).toEqual({
        kind: 'typeConstructor',
        documentation: expect.stringMatching(/\S/),
        output: {
          codecId,
          nativeType: codecLookup.targetTypesFor(codecId)?.[0],
        },
      });
    }
  });
});

describe('postgresNativeAuthoringTypes', () => {
  it('contributes all native types as bare-eligible top-level constructors', () => {
    const derived = collectScalarTypeConstructors(postgresNativeAuthoringTypes);

    expect(Object.fromEntries(derived)).toEqual({
      VarChar: { codecId: 'sql/varchar@1', nativeType: 'character varying' },
      Char: { codecId: 'sql/char@1', nativeType: 'character' },
      Numeric: { codecId: 'pg/numeric@1', nativeType: 'numeric' },
      Timestamp: { codecId: 'pg/timestamp-temporal@1', nativeType: 'timestamp' },
      Timestamptz: { codecId: 'pg/timestamptz-temporal@1', nativeType: 'timestamptz' },
      Time: { codecId: 'pg/time-temporal@1', nativeType: 'time' },
      Timetz: { codecId: 'pg/timetz@1', nativeType: 'timetz' },
      Uuid: { codecId: 'pg/uuid@1', nativeType: 'uuid' },
      Inet: { codecId: 'pg/inet@1', nativeType: 'inet' },
      SmallInt: { codecId: 'pg/int2@1', nativeType: 'int2' },
      Real: { codecId: 'pg/float4@1', nativeType: 'float4' },
      Date: { codecId: 'pg/date-temporal@1', nativeType: 'date' },
      DateString: { codecId: 'pg/date-string@1', nativeType: 'date' },
      TimestampString: { codecId: 'pg/timestamp-string@1', nativeType: 'timestamp' },
      TimestamptzString: { codecId: 'pg/timestamptz-string@1', nativeType: 'timestamptz' },
      TimestamptzJsDate: { codecId: 'pg/timestamptz-date@1', nativeType: 'timestamptz' },
      TimeString: { codecId: 'pg/time-string@1', nativeType: 'time' },
    });
  });

  it('materializes typeParams keys only for arguments that are given', () => {
    expect(
      instantiateAuthoringTypeConstructor(postgresNativeAuthoringTypes.VarChar, [191]),
    ).toEqual({
      codecId: 'sql/varchar@1',
      nativeType: 'character varying',
      typeParams: { length: 191 },
    });
    expect(instantiateAuthoringTypeConstructor(postgresNativeAuthoringTypes.Numeric, [10])).toEqual(
      {
        codecId: 'pg/numeric@1',
        nativeType: 'numeric',
        typeParams: { precision: 10 },
      },
    );
    expect(
      instantiateAuthoringTypeConstructor(postgresNativeAuthoringTypes.Numeric, [10, 2]),
    ).toEqual({
      codecId: 'pg/numeric@1',
      nativeType: 'numeric',
      typeParams: { precision: 10, scale: 2 },
    });
    expect(instantiateAuthoringTypeConstructor(postgresNativeAuthoringTypes.Timetz, [2])).toEqual({
      codecId: 'pg/timetz@1',
      nativeType: 'timetz',
      typeParams: { precision: 2 },
    });
  });

  it('rejects out-of-range arguments via the declarative minimums', () => {
    expect(() =>
      validateAuthoringHelperArguments('VarChar', postgresNativeAuthoringTypes.VarChar.args, [0]),
    ).toThrow('must be >= 1');
    expect(() =>
      validateAuthoringHelperArguments('Numeric', postgresNativeAuthoringTypes.Numeric.args, [0]),
    ).toThrow('must be >= 1');
    expect(() =>
      validateAuthoringHelperArguments(
        'Timestamp',
        postgresNativeAuthoringTypes.Timestamp.args,
        [-1],
      ),
    ).toThrow('must be >= 0');
  });

  it('offers only the precision-bearing TimestamptzJsDate for a Date-backed timestamptz', () => {
    expect(postgresAuthoringTypes).not.toHaveProperty('DateTimeDate');
    expect(postgresAuthoringTypes).not.toHaveProperty('TimestamptzDate');
    expect(postgresAuthoringTypes).toHaveProperty('TimestamptzJsDate', {
      kind: 'typeConstructor',
      documentation:
        'An instant stored as PostgreSQL timestamptz and represented as a JavaScript Date.',
      args: [{ kind: 'number', name: 'precision', integer: true, minimum: 0, optional: true }],
      output: {
        codecId: 'pg/timestamptz-date@1',
        nativeType: 'timestamptz',
        typeParams: { precision: { kind: 'arg', index: 0 } },
      },
    });
    expect(postgresAuthoringTypes.DateTime.output.codecId).toBe('pg/timestamptz-temporal@1');
    expect(postgresAuthoringTypes.Timestamptz.output.codecId).toBe('pg/timestamptz-temporal@1');
  });
});

/**
 * `contract infer` writes a default in the form the codec `contract emit` binds to the type name it
 * writes reads back. It restates that binding for the type names it writes; this fails if the two
 * disagree.
 */
describe('the codec bound to each inferred PSL type name', () => {
  const emitCodecIdByTypeName: ReadonlyMap<string, string> = new Map(
    [
      ...Object.entries(postgresScalarAuthoringTypes),
      ...Object.entries(postgresNativeAuthoringTypes),
    ].map(([typeName, typeConstructor]) => [typeName, typeConstructor.output.codecId]),
  );

  it('has a binding to compare against', () => {
    expect(emitCodecIdByTypeName.size).toBeGreaterThan(0);
    expect(CODEC_ID_BY_INFERRED_TYPE.size).toBeGreaterThan(0);
  });

  it('agrees with the type constructor contract emit resolves', () => {
    expect(
      [...CODEC_ID_BY_INFERRED_TYPE].map(([typeName, codecId]) => ({ typeName, codecId })),
    ).toEqual(
      [...CODEC_ID_BY_INFERRED_TYPE.keys()].map((typeName) => ({
        typeName,
        codecId: emitCodecIdByTypeName.get(typeName),
      })),
    );
  });
});
