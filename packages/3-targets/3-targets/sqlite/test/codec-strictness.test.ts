import type { CodecInstanceContext } from '@internal/framework-components/codec';
import { describe, expect, it } from 'vitest';
import {
  sqliteBigintDescriptor,
  sqliteBigintNumberDescriptor,
  sqliteDatetimeDescriptor,
  sqliteIntegerDescriptor,
  sqliteJsonDescriptor,
  sqliteRealDescriptor,
  sqliteSqlIntDescriptor,
} from '../src/core/codecs';

const ctx: CodecInstanceContext = { name: 'codec-strictness' };

describe('sqlite/bigint@1 decodeJson', () => {
  const codec = sqliteBigintDescriptor.factory()(ctx);

  it('reads digit text', () => {
    expect(codec.decodeJson('9007199254740993')).toBe(9007199254740993n);
  });

  it.each([
    ['a whole JSON number', 42],
    ['a fractional JSON number', 1.5],
  ])('refuses %s', (_name, json) => {
    expect(() => codec.decodeJson(json)).toThrow(
      'sqlite/bigint@1 database JSON value must be a decimal string',
    );
  });
});

describe('sqlite/bigintnumber@1 digit text', () => {
  const codec = sqliteBigintNumberDescriptor.factory()(ctx);

  it.each([
    ['a positive value', 42, '42'],
    ['a negative value', -42, '-42'],
    ['the top of the safe integer range', 9007199254740991, '9007199254740991'],
  ])('round-trips %s as digit text', (_name, value, text) => {
    expect(codec.encodeJson(value)).toBe(text);
    expect(codec.decodeJson(text)).toBe(value);
  });

  it('refuses a JSON number', () => {
    expect(() => codec.decodeJson(42)).toThrow(
      'sqlite/bigintnumber@1 database JSON value must be decimal text',
    );
  });

  it.each([['9007199254740992'], ['-9007199254740992'], ['9007199254740993']])(
    'refuses the digit text %s, naming the limit',
    (json) => {
      expect(() => codec.decodeJson(json)).toThrow(
        'sqlite/bigintnumber@1 value must be an integer within the safe integer range',
      );
    },
  );

  it('refuses decimal text', () => {
    expect(() => codec.decodeJson('1.5')).toThrow(
      'sqlite/bigintnumber@1 database JSON value must be decimal text',
    );
  });
});

describe.each([
  ['sqlite/integer@1', sqliteIntegerDescriptor],
  ['sql/int@1', sqliteSqlIntDescriptor],
] as const)('%s digit text', (codecId, descriptor) => {
  const codec = descriptor.factory()(ctx);

  it.each([
    ['zero', 0, '0'],
    ['a negative value', -42, '-42'],
    ['the top of the safe integer range', 9007199254740991, '9007199254740991'],
    ['the bottom of the safe integer range', -9007199254740991, '-9007199254740991'],
  ])('round-trips %s as digit text', (_name, value, text) => {
    expect(codec.encodeJson(value)).toBe(text);
    expect(codec.decodeJson(text)).toBe(value);
  });

  it.each([
    ['a JSON number', 42],
    ['decimal text', '1.5'],
    ['text with a plus sign', '+1'],
    ['a boolean', true],
  ])('refuses %s', (_name, json) => {
    expect(() => codec.decodeJson(json)).toThrow(
      `${codecId} database JSON value must be decimal text`,
    );
  });

  it.each([['9007199254740992'], ['-9007199254740992']])(
    'refuses the digit text %s, which no number holds exactly',
    (json) => {
      expect(() => codec.decodeJson(json)).toThrow(
        `${codecId} value must be an integer within the safe integer range`,
      );
    },
  );

  it.each([
    ['a number with a fraction', 1.5],
    ['a number past the safe integer range', 9007199254740992],
  ])('refuses to write %s', (_name, value) => {
    expect(() => codec.encodeJson(value)).toThrow(
      `${codecId} value must be an integer within the safe integer range`,
    );
  });
});

describe('sqlite/json@1 JSON text', () => {
  const codec = sqliteJsonDescriptor.factory()(ctx);

  it.each([
    [
      'an object, keys sorted',
      { b: [1, 'two'], a: { d: null, c: true } },
      '{"a":{"c":true,"d":null},"b":[1,"two"]}',
    ],
    ['a string', 'plain', '"plain"'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
  ])('writes %s as its JSON text', (_name, value, text) => {
    expect(codec.encodeJson(value)).toBe(text);
  });

  it.each([
    ['an object', '{"a":1,"b":["x"]}', { a: 1, b: ['x'] }],
    ['a string', '"plain"', 'plain'],
    ['null', 'null', null],
  ])('reads the JSON text of %s', (_name, text, value) => {
    expect(codec.decodeJson(text)).toEqual(value);
  });

  it('refuses text that is not JSON', () => {
    expect(() => codec.decodeJson('hello')).toThrow(
      'sqlite/json@1 contract value must be the JSON text of a document',
    );
  });

  it('refuses a document that is not text', () => {
    expect(() => codec.decodeJson({ a: 1 })).toThrow(
      'sqlite/json@1 contract value must be the JSON text of a document',
    );
  });
});

describe('sqlite/datetime@1 text', () => {
  const codec = sqliteDatetimeDescriptor.factory()(ctx);

  it('writes and reads an instant as its ISO text', () => {
    const instant = new Date('2026-01-02T03:04:05.678Z');
    expect(codec.encodeJson(instant)).toBe('2026-01-02T03:04:05.678Z');
    expect(codec.decodeJson('2026-01-02T03:04:05.678Z')).toEqual(instant);
  });
});

describe('sqlite/real@1 decodeJson', () => {
  const codec = sqliteRealDescriptor.factory()(ctx);

  it('reads a JSON number', () => {
    expect(codec.decodeJson(1.5)).toBe(1.5);
  });

  it.each([
    ['digit text', '42'],
    ['decimal text', '1.5'],
    ['the text NaN', 'NaN'],
    ['the text Infinity', 'Infinity'],
    ['the text -Infinity', '-Infinity'],
  ])('refuses %s', (_name, json) => {
    expect(() => codec.decodeJson(json)).toThrow(
      'sqlite/real@1 database JSON value must be a number',
    );
  });
});
