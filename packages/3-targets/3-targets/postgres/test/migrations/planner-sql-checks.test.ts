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
          { dataType: 'pg/int2', codecId: 'pg/int2@1', nullable: false },
          types,
        ),
      ).toBe('smallint');
    });

    it('maps timestamptz to timestamp with time zone', () => {
      expect(
        buildExpectedFormatType(
          { dataType: 'pg/timestamptz', codecId: 'pg/timestamptz-temporal@1', nullable: false },
          types,
        ),
      ).toBe('timestamp with time zone');
    });
  });

  describe('unmapped native types pass through', () => {
    it('returns nativeType as-is for text', () => {
      expect(
        buildExpectedFormatType(
          { dataType: 'pg/text', codecId: 'pg/text@1', nullable: false },
          types,
        ),
      ).toBe('text');
    });
  });

  describe('parameterized data types', () => {
    it('renders the data type with its parameters', () => {
      expect(
        buildExpectedFormatType(
          {
            dataType: 'pg/numeric',
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
            dataType: 'pg/int4',
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
    it('resolves nativeType/codecId from the referenced storage type, then applies the display map', () => {
      expect(
        buildExpectedFormatType(
          { nativeType: 'unused', codecId: 'unused', nullable: false, typeRef: 'MyStatus' },
          types,
          { MyStatus: toStorageTypeInstance({ codecId: 'pg/int4@1', dataType: 'pg/int4' }) },
        ),
      ).toBe('integer');
    });
  });
});
