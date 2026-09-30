import type { StorageColumn } from '@internal/sql-contract/types';
import { describe, expect, it } from 'vitest';
import {
  buildColumnDefaultSql,
  buildColumnTypeSql,
  type DefaultLiteralColumn,
  renderDefaultLiteral,
} from '../../src/core/migrations/planner-ddl-builders';
import { postgresTypeLookups } from '../postgres-type-lookups';

function arrayColumn(typeText: string): DefaultLiteralColumn {
  return { typeText, dataType: 'pg/text', many: true };
}

describe('renderDefaultLiteral array columns', () => {
  it('renders an empty array default as the empty array literal', () => {
    expect(renderDefaultLiteral([], arrayColumn('text[]'))).toBe("'{}'");
  });

  it('renders a string array default as an ARRAY[...] expression cast to the column type', () => {
    expect(renderDefaultLiteral(['a', 'b'], arrayColumn('text[]'))).toBe("ARRAY['a', 'b']::text[]");
  });

  it('renders Date array elements as ISO timestamp literals, not JSON blobs', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(renderDefaultLiteral([d], arrayColumn('timestamptz[]'))).toBe(
      "ARRAY['2026-01-02T03:04:05.000Z']::timestamptz[]",
    );
  });

  it.each([
    {
      value: ['1', '-2', '9007199254740993'],
      typeText: 'int8',
      sql: "ARRAY['1', '-2', '9007199254740993']::int8[]",
    },
    {
      value: ['1.5', '-2.25'],
      typeText: 'numeric(65,30)',
      sql: "ARRAY['1.5', '-2.25']::numeric(65,30)[]",
    },
    { value: ['1.50'], typeText: 'numeric', sql: "ARRAY['1.50']::numeric[]" },
    {
      value: ['2024-01-01T00:00:00'],
      typeText: 'timestamp(3)',
      sql: "ARRAY['2024-01-01T00:00:00']::timestamp(3)[]",
    },
  ])('casts the text elements of a $typeText list to the list type', ({ value, typeText, sql }) => {
    expect(renderDefaultLiteral(value, arrayColumn(typeText))).toBe(sql);
    expect(renderDefaultLiteral(value, arrayColumn(`${typeText}[]`))).toBe(sql);
  });

  it.each([
    { typeName: 'order', cast: '"order"[]' },
    { typeName: 'my enum', cast: '"my enum"[]' },
    { typeName: 'my"enum', cast: '"my""enum"[]' },
    { typeName: 'user_role', cast: '"user_role"[]' },
    { typeName: 'audit.AuditAction', cast: '"audit"."AuditAction"[]' },
  ])(
    'casts a list of the enum $typeName to the column type, quoted as DDL writes it',
    ({ typeName, cast }) => {
      const enumList: StorageColumn = {
        dataType: 'pg/enum',
        codecId: 'pg/enum@1',
        nullable: true,
        many: true,
        typeParams: { typeName },
      };
      const columnTypeSql = buildColumnTypeSql(enumList, postgresTypeLookups, {}, false);

      expect(
        buildColumnDefaultSql(
          { kind: 'literal', value: ['asc'] },
          { many: true, typeText: columnTypeSql, dataType: 'pg/enum' },
        ),
      ).toBe(`DEFAULT ARRAY['asc']::${cast}`);
    },
  );

  it('renders an ARRAY[...] expression without a cast when no native type is known', () => {
    expect(renderDefaultLiteral(['a'], arrayColumn(''))).toBe("ARRAY['a']");
  });

  it('renders a null literal default on a many column as NULL', () => {
    expect(renderDefaultLiteral(null, arrayColumn('text[]'))).toBe('NULL');
  });
});
