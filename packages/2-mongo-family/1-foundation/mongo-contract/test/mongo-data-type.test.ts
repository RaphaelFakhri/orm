import { dataType } from '@internal/framework-components/codec';
import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { isMongoDataType, mongoDataType } from '../src/mongo-data-type';

describe('mongoDataType', () => {
  it('declares a data type with the BSON types it is stored as', () => {
    const declared = mongoDataType('demo/number', { bsonTypes: ['int', 'long'] });
    expect(declared).toEqual({ id: 'demo/number', casts: {}, bsonTypes: ['int', 'long'] });
  });

  it('allows a type stored as no one BSON type', () => {
    expect(mongoDataType('demo/any', { bsonTypes: [] }).bsonTypes).toEqual([]);
  });

  it('keeps the parameter schema and the casts', () => {
    const params = type({ 'length?': 'number.integer >= 1' });
    const text = mongoDataType('demo/text', { bsonTypes: ['string'] });
    const declared = mongoDataType('demo/vector', {
      bsonTypes: ['array'],
      params,
      casts: { [text.id]: (value) => value },
    });
    expect(declared.params).toBe(params);
    expect(declared.casts[text.id]?.('x')).toBe('x');
  });

  it('validates its id like every data type', () => {
    expect(() => mongoDataType('demo/number@1', { bsonTypes: [] })).toThrow(
      /is not a data type id/,
    );
  });
});

describe('isMongoDataType', () => {
  it('recognises a Mongo data type', () => {
    expect(isMongoDataType(mongoDataType('demo/number', { bsonTypes: ['int'] }))).toBe(true);
  });

  it('does not claim a plain data type', () => {
    expect(isMongoDataType(dataType('demo/plain', {}))).toBe(false);
  });
});
