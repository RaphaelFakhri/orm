import { toStorageTypeInstance } from '@internal/sql-contract/types';
import { describe, expect, it } from 'vitest';
import {
  buildExpectedFormatType,
  qualifyTableName,
} from '../../src/core/migrations/planner-sql-checks';
import { postgresTypeLookups as types } from '../postgres-type-lookups';

describe('qualifyTableName', () => {
  it('quotes schema and table', () => {
    expect(qualifyTableName('public', 'user')).toBe('"public"."user"');
  });

  it('elides the qualifier for the unbound schema sentinel', () => {
    expect(qualifyTableName('__unbound__', 'post')).toBe('"post"');
  });
});

describe('buildExpectedFormatType', () => {
  describe('FORMAT_TYPE_DISPLAY mappings', () => {
    it('maps int2 to smallint', () => {
      expect(
        buildExpectedFormatType(
          { nativeType: 'int2', codecId: 'pg/int2@1', nullable: false },
          types,
        ),
      ).toBe('smallint');
    });

    it('maps timestamptz to timestamp with time zone', () => {
      expect(
        buildExpectedFormatType(
          { nativeType: 'timestamptz', codecId: 'pg/timestamptz-temporal@1', nullable: false },
          types,
        ),
      ).toBe('timestamp with time zone');
    });
  });

  describe('unmapped native types pass through', () => {
    it('returns nativeType as-is for text', () => {
      expect(
        buildExpectedFormatType(
          { nativeType: 'text', codecId: 'pg/text@1', nullable: false },
          types,
        ),
      ).toBe('text');
    });
  });

  describe('user-defined types (typeRef path)', () => {
    it('returns simple lowercase UDT name unquoted', () => {
      expect(
        buildExpectedFormatType(
          {
            nativeType: 'my_status',
            codecId: 'pg/enum@1',
            nullable: false,
            typeParams: { typeName: 'my_status' },
            typeRef: 'MyStatus',
          },
          types,
        ),
      ).toBe('my_status');
    });

    it('quotes reserved word used as UDT name', () => {
      expect(
        buildExpectedFormatType(
          {
            nativeType: 'user',
            codecId: 'pg/enum@1',
            nullable: false,
            typeParams: { typeName: 'user' },
            typeRef: 'User',
          },
          types,
        ),
      ).toBe('"user"');
    });

    it('quotes mixed-case identifier', () => {
      expect(
        buildExpectedFormatType(
          {
            nativeType: 'OrderStatus',
            codecId: 'pg/enum@1',
            nullable: false,
            typeParams: { typeName: 'OrderStatus' },
            typeRef: 'OrderStatus',
          },
          types,
        ),
      ).toBe('"OrderStatus"');
    });
  });

  describe('parameterized data types', () => {
    it('renders the data type with its parameters', () => {
      expect(
        buildExpectedFormatType(
          {
            nativeType: 'numeric',
            codecId: 'pg/numeric@1',
            nullable: false,
            typeParams: { precision: 10, scale: 2 },
          },
          types,
        ),
      ).toBe('numeric(10,2)');
    });

    it('falls back to display map when typeParams are ones the data type does not declare', () => {
      expect(
        buildExpectedFormatType(
          {
            nativeType: 'int4',
            codecId: 'pg/int4@1',
            nullable: false,
            typeParams: { someParam: true },
          },
          types,
        ),
      ).toBe('integer');
    });

    it('throws CONTRACT.CODEC_DESCRIPTOR_MISSING when codecId is missing', () => {
      expect(() =>
        buildExpectedFormatType(
          {
            nativeType: 'int4',
            codecId: '',
            nullable: false,
            typeParams: { someParam: true },
          },
          types,
        ),
      ).toThrow(expect.objectContaining({ code: 'CONTRACT.CODEC_DESCRIPTOR_MISSING' }));
    });
  });

  describe('typeRef resolution against a storage type catalog', () => {
    it('resolves nativeType/codecId from the referenced storage type, then formats as a UDT name (typeRef wins over the display map)', () => {
      expect(
        buildExpectedFormatType(
          { nativeType: 'unused', codecId: 'unused', nullable: false, typeRef: 'MyStatus' },
          types,
          { MyStatus: toStorageTypeInstance({ codecId: 'pg/int4@1', nativeType: 'int4' }) },
        ),
      ).toBe('int4');
    });
  });
});
