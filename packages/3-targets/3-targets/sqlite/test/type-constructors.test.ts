import { collectScalarTypeConstructors } from '@internal/framework-components/authoring';
import { describe, expect, it } from 'vitest';
import { sqliteAuthoringTypes, sqliteScalarAuthoringTypes } from '../src/core/authoring';
import sqliteTargetPack from '../src/exports/pack';

describe('the type constructors the SQLite target contributes', () => {
  it('are the target’s own, then the base scalars, in that order', () => {
    expect(sqliteTargetPack.authoring.type).toBe(sqliteAuthoringTypes);
    expect(Object.keys(sqliteAuthoringTypes)).toEqual([
      'BigIntNumber',
      ...Object.keys(sqliteScalarAuthoringTypes),
    ]);
  });

  it('pins every base scalar to its codec and native type', () => {
    expect(Object.fromEntries(collectScalarTypeConstructors(sqliteScalarAuthoringTypes))).toEqual({
      String: { codecId: 'sqlite/text@1', nativeType: 'text' },
      Int: { codecId: 'sqlite/integer@1', nativeType: 'integer' },
      BigInt: { codecId: 'sqlite/bigint@1', nativeType: 'integer' },
      Float: { codecId: 'sqlite/real@1', nativeType: 'real' },
      Decimal: { codecId: 'sqlite/text@1', nativeType: 'text' },
      DateTime: { codecId: 'sqlite/datetime@1', nativeType: 'text' },
      Json: { codecId: 'sqlite/json@1', nativeType: 'text' },
      Bytes: { codecId: 'sqlite/blob@1', nativeType: 'blob' },
    });
  });

  it.each(Object.entries(sqliteAuthoringTypes))('documents %s', (_name, descriptor) => {
    expect(descriptor).toHaveProperty('documentation', expect.stringMatching(/\S.+/));
  });
});
