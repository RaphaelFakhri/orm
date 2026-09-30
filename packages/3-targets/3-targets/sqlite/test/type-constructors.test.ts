import { collectScalarTypeConstructors } from '@internal/framework-components/authoring';
import { createDataTypeLookup } from '@internal/framework-components/codec';
import { storedSqlTypeNameOfCodec } from '@internal/sql-contract/data-type';
import { describe, expect, it } from 'vitest';
import { sqliteAuthoringTypes, sqliteScalarAuthoringTypes } from '../src/core/authoring';
import { createSqliteBuiltinCodecLookup } from '../src/core/codec-registry';
import { sqliteDataTypes } from '../src/core/data-types';
import sqliteTargetPack from '../src/exports/pack';

describe('the type constructors the SQLite target contributes', () => {
  it('are the target’s own, then the base scalars, in that order', () => {
    expect(sqliteTargetPack.authoring.type).toBe(sqliteAuthoringTypes);
    expect(Object.keys(sqliteAuthoringTypes)).toEqual([
      'BigIntNumber',
      ...Object.keys(sqliteScalarAuthoringTypes),
    ]);
  });

  const scalarNames = [
    ['String', 'sqlite/text@1', 'text'],
    ['Int', 'sqlite/integer@1', 'integer'],
    ['BigInt', 'sqlite/bigint@1', 'integer'],
    ['Float', 'sqlite/real@1', 'real'],
    ['Decimal', 'sqlite/text@1', 'text'],
    ['DateTime', 'sqlite/datetime@1', 'text'],
    ['Json', 'sqlite/json@1', 'text'],
    ['Bytes', 'sqlite/blob@1', 'blob'],
  ] as const;

  it('pins every base scalar to its codec', () => {
    expect(Object.fromEntries(collectScalarTypeConstructors(sqliteScalarAuthoringTypes))).toEqual(
      Object.fromEntries(scalarNames.map(([name, codecId]) => [name, { codecId }])),
    );
  });

  it.each(scalarNames)(
    '%s keeps its type name, now its codec’s data type’s',
    (_name, codecId, typeName) => {
      expect(
        storedSqlTypeNameOfCodec(codecId, undefined, {
          codecLookup: createSqliteBuiltinCodecLookup(),
          dataTypeLookup: createDataTypeLookup(sqliteDataTypes),
        }),
      ).toBe(typeName);
    },
  );

  it('marks no constructor inferred, because SQLite has no contract infer', () => {
    expect(
      Object.values(sqliteAuthoringTypes).filter((descriptor) => 'inferred' in descriptor),
    ).toEqual([]);
  });

  it.each(Object.entries(sqliteAuthoringTypes))('documents %s', (_name, descriptor) => {
    expect(descriptor).toHaveProperty('documentation', expect.stringMatching(/\S.+/));
  });
});
