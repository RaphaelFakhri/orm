import type { CodecLookup } from '@internal/framework-components/codec';
import { createDataTypeLookup, dataType } from '@internal/framework-components/codec';
import { InternalError } from '@internal/utils/internal-error';
import { describe, expect, it } from 'vitest';
import { storedSqlTypeName, storedSqlTypeNameOfCodec } from '../src/sql-data-type';
import { enumType, geometry, int4, numeric, textArray, vector } from './sql-data-type-fixtures';

const invalidParams = expect.objectContaining({ code: 'CONTRACT.TYPE_PARAMS_INVALID' });

describe('storedSqlTypeName', () => {
  it('is the base name for a type written by name', () => {
    expect(storedSqlTypeName(int4, undefined)).toBe('int4');
    expect(storedSqlTypeName(numeric, { precision: 10, scale: 2 })).toBe('numeric');
    expect(storedSqlTypeName(vector, { length: 3 })).toBe('vector');
    expect(storedSqlTypeName(vector, {})).toBe('vector');
    expect(storedSqlTypeName(geometry, { srid: 4326 })).toBe('geometry');
  });

  it('ignores keys the data type does not declare', () => {
    expect(storedSqlTypeName(numeric, { precision: 10, expression: 'x' })).toBe('numeric');
  });

  it('is the unquoted typeName for a type that claims a kind', () => {
    expect(storedSqlTypeName(enumType, { typeName: 'app.status' })).toBe('app.status');
    expect(storedSqlTypeName(enumType, { typeName: 'Mood' })).toBe('Mood');
  });

  it('refuses a kind-claiming type without a typeName', () => {
    expect(() => storedSqlTypeName(enumType, {})).toThrow(invalidParams);
  });

  it('does not exist for a type that is never written', () => {
    expect(() => storedSqlTypeName(textArray, {})).toThrow(InternalError);
  });

  it('does not exist for a data type that is not a SQL data type', () => {
    expect(() => storedSqlTypeName(dataType('t/plain', {}), {})).toThrow(InternalError);
  });
});

describe('storedSqlTypeNameOfCodec', () => {
  const dataTypeLookup = createDataTypeLookup([int4, enumType]);
  const codecLookup: Pick<CodecLookup, 'descriptorFor'> = {
    descriptorFor: (id) =>
      ({
        't/int4@1': { codecId: id, dataType: int4.id },
        't/enum@1': { codecId: id, dataType: enumType.id },
        't/orphan@1': { codecId: id, dataType: 't/gone' },
      })[id] as never,
  };
  const lookups = { codecLookup, dataTypeLookup };

  it('names the type of the codec’s data type', () => {
    expect(storedSqlTypeNameOfCodec('t/int4@1', undefined, lookups)).toBe('int4');
    expect(storedSqlTypeNameOfCodec('t/enum@1', { typeName: 'Mood' }, lookups)).toBe('Mood');
  });

  it('refuses a codec the stack does not register', () => {
    expect(() => storedSqlTypeNameOfCodec('t/unknown@1', undefined, lookups)).toThrow(
      expect.objectContaining({ code: 'CONTRACT.CODEC_DESCRIPTOR_MISSING' }),
    );
  });

  it('refuses a codec whose data type the stack does not register', () => {
    expect(() => storedSqlTypeNameOfCodec('t/orphan@1', undefined, lookups)).toThrow(
      expect.objectContaining({ code: 'CONTRACT.DATA_TYPE_UNREGISTERED' }),
    );
  });
});
