import { createDataTypeLookup } from '@internal/framework-components/codec';
import type { SqlTypeLookups } from '@internal/sql-contract/data-type';
import { type StorageColumn, toStorageTypeInstance } from '@internal/sql-contract/types';
import { postgresCodecDescriptorRegistry } from '@internal/target-postgres/codecs';
import { postgresDataTypes } from '@internal/target-postgres/data-types';
import {
  buildColumnDefaultSql,
  buildColumnTypeSql,
  type DefaultLiteralColumn,
  renderDefaultLiteral,
} from '@internal/target-postgres/planner-ddl-builders';
import { describe, expect, it } from 'vitest';

const types: SqlTypeLookups = {
  codecLookup: postgresCodecDescriptorRegistry,
  dataTypeLookup: createDataTypeLookup(postgresDataTypes),
};

function col(overrides: Partial<StorageColumn> & { nativeType: string }): StorageColumn {
  return { codecId: 'pg/text@1', nullable: true, ...overrides };
}

function listColumn(nativeType: string): DefaultLiteralColumn {
  return { nativeType, dataType: 'pg/text', many: true };
}

// ---------------------------------------------------------------------------
// buildColumnTypeSql
// ---------------------------------------------------------------------------

describe('buildColumnTypeSql', () => {
  it('returns the data type name for plain columns', () => {
    expect(buildColumnTypeSql(col({ nativeType: 'text' }), types)).toBe('text');
  });

  it('returns SERIAL for int4 with autoincrement', () => {
    const column = col({
      codecId: 'pg/int4@1',
      default: { kind: 'function', expression: 'autoincrement()' },
    });
    expect(buildColumnTypeSql(column, types)).toBe('SERIAL');
  });

  it('returns BIGSERIAL for int8 with autoincrement', () => {
    const column = col({
      codecId: 'pg/int8@1',
      default: { kind: 'function', expression: 'autoincrement()' },
    });
    expect(buildColumnTypeSql(column, types)).toBe('BIGSERIAL');
  });

  it('returns SMALLSERIAL for int2 with autoincrement', () => {
    const column = col({
      codecId: 'pg/int2@1',
      default: { kind: 'function', expression: 'autoincrement()' },
    });
    expect(buildColumnTypeSql(column, types)).toBe('SMALLSERIAL');
  });

  it('writes a typeRef column as a column of the referenced type', () => {
    const column = col({ nativeType: 'auth.aal_level', typeRef: 'AalLevel' });
    const storageTypes = {
      AalLevel: toStorageTypeInstance({
        codecId: 'pg/enum@1',
        dataType: 'pg/enum',
        typeParams: { typeName: 'auth.aal_level' },
      }),
    };
    expect(buildColumnTypeSql(column, types, storageTypes)).toBe('"auth"."aal_level"');
  });

  it('renders an unqualified named-type column as a single quoted identifier', () => {
    const column = col({
      codecId: 'pg/enum@1',
      typeParams: { typeName: 'order_status' },
    });
    expect(buildColumnTypeSql(column, types)).toBe('"order_status"');
  });

  it('renders a schema-qualified named-type column segment-by-segment', () => {
    const column = col({
      codecId: 'pg/enum@1',
      typeParams: { typeName: 'auth.aal_level' },
    });
    expect(buildColumnTypeSql(column, types)).toBe('"auth"."aal_level"');
  });

  it('appends [] for a named-type array column', () => {
    const column = col({
      codecId: 'pg/enum@1',
      typeParams: { typeName: 'order_status' },
      many: true,
    });
    expect(buildColumnTypeSql(column, types)).toBe('"order_status"[]');
  });

  it('writes the parameters of a parameterized data type', () => {
    const column = col({
      codecId: 'pg/varchar@1',
      typeParams: { length: 3 },
    });
    expect(buildColumnTypeSql(column, types)).toBe('character varying(3)');
  });

  it('ignores the contract native type', () => {
    expect(buildColumnTypeSql(col({ nativeType: 'text; DROP TABLE' }), types)).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// buildColumnDefaultSql
// ---------------------------------------------------------------------------

describe('buildColumnDefaultSql', () => {
  it('returns empty string for undefined default', () => {
    expect(buildColumnDefaultSql(undefined)).toBe('');
  });

  it('renders literal string default', () => {
    expect(buildColumnDefaultSql({ kind: 'literal', value: 'hello' })).toBe("DEFAULT 'hello'");
  });

  it('renders literal number default', () => {
    expect(buildColumnDefaultSql({ kind: 'literal', value: 42 })).toBe('DEFAULT 42');
  });

  it('renders literal boolean default', () => {
    expect(buildColumnDefaultSql({ kind: 'literal', value: true })).toBe('DEFAULT true');
  });

  it('returns empty string for autoincrement function', () => {
    expect(buildColumnDefaultSql({ kind: 'function', expression: 'autoincrement()' })).toBe('');
  });

  it('renders non-autoincrement function default', () => {
    expect(buildColumnDefaultSql({ kind: 'function', expression: 'now()' })).toBe(
      'DEFAULT (now())',
    );
  });

  it('renders sequence default', () => {
    expect(buildColumnDefaultSql({ kind: 'sequence', name: 'user_id_seq' })).toBe(
      `DEFAULT nextval('"user_id_seq"'::regclass)`,
    );
  });

  it('rejects unsafe function expressions', () => {
    expect(() =>
      buildColumnDefaultSql({ kind: 'function', expression: 'now(); DROP TABLE users' }),
    ).toThrow('Unsafe default expression');
  });
});

// ---------------------------------------------------------------------------
// renderDefaultLiteral
// ---------------------------------------------------------------------------

describe('renderDefaultLiteral', () => {
  it('renders string', () => {
    expect(renderDefaultLiteral('hello')).toBe("'hello'");
  });

  it('renders number', () => {
    expect(renderDefaultLiteral(42)).toBe('42');
  });

  it('renders boolean', () => {
    expect(renderDefaultLiteral(false)).toBe('false');
  });

  it('renders null', () => {
    expect(renderDefaultLiteral(null)).toBe('NULL');
  });

  it('renders JSON object for jsonb column', () => {
    const result = renderDefaultLiteral(
      { key: 'val' },
      { nativeType: 'jsonb', dataType: 'pg/jsonb' },
    );
    expect(result).toBe(`'{"key":"val"}'::jsonb`);
  });

  it('renders JSON object without cast for non-json column', () => {
    const result = renderDefaultLiteral({ key: 'val' });
    expect(result).toBe(`'{"key":"val"}'`);
  });

  it('renders an empty array literal for a list column', () => {
    const result = renderDefaultLiteral([], listColumn('text'));
    expect(result).toBe("'{}'");
  });

  it('renders a populated array literal for a list column, cast to the list type', () => {
    const result = renderDefaultLiteral(['a', 'b'], listColumn('text'));
    expect(result).toBe(`ARRAY['a', 'b']::text[]`);
  });

  it('renders a mixed-type array literal element-by-element', () => {
    const result = renderDefaultLiteral([1, true, null], listColumn('int4'));
    expect(result).toBe('ARRAY[1, true, NULL]::int4[]');
  });
});

describe('buildColumnDefaultSql with a list column', () => {
  it('renders DEFAULT with an empty array literal', () => {
    const result = buildColumnDefaultSql({ kind: 'literal', value: [] }, listColumn('text'));
    expect(result).toBe("DEFAULT '{}'");
  });

  it('renders DEFAULT with a populated array literal', () => {
    const result = buildColumnDefaultSql(
      { kind: 'literal', value: ['a', 'b'] },
      listColumn('text'),
    );
    expect(result).toBe(`DEFAULT ARRAY['a', 'b']::text[]`);
  });

  it('renders DEFAULT with int8 text elements cast to the list type', () => {
    const result = buildColumnDefaultSql(
      { kind: 'literal', value: ['1', '9007199254740993'] },
      listColumn('int8[]'),
    );
    expect(result).toBe(`DEFAULT ARRAY['1', '9007199254740993']::int8[]`);
  });
});
