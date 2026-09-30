import { describe, expect, it } from 'vitest';
import {
  printSqlExpressionLiteral,
  SQL_EXPRESSION_DATA_TYPE_ID,
  SQL_EXPRESSION_TAG,
  sqlExpressionAuthoringEntry,
  sqlExpressionDataType,
  sqlTextFromCanonical,
} from '../src/sql-expression';

describe('sqlExpressionDataType', () => {
  it('has the id sql/expression and declares no casts and no list cast', () => {
    expect({
      id: sqlExpressionDataType.id,
      constant: SQL_EXPRESSION_DATA_TYPE_ID,
      casts: sqlExpressionDataType.casts,
      listCast: sqlExpressionDataType.listCast,
    }).toEqual({
      id: 'sql/expression',
      constant: 'sql/expression',
      casts: {},
      listCast: undefined,
    });
  });
});

describe('sqlExpressionAuthoringEntry', () => {
  it('is written with the sql tag', () => {
    expect({
      tag: SQL_EXPRESSION_TAG,
      written: { kind: sqlExpressionAuthoringEntry.written.kind },
      documentation: sqlExpressionAuthoringEntry.documentation,
    }).toEqual({
      tag: 'sql',
      written: { kind: 'tag' },
      documentation:
        "SQL in the target database's language. Prisma passes it to the database unchanged.",
    });
    expect(sqlExpressionAuthoringEntry.written).toMatchObject({ kind: 'tag', tag: 'sql' });
  });

  it('reads a text as itself and prints it back', () => {
    const { written } = sqlExpressionAuthoringEntry;
    if (written.kind !== 'tag') throw new Error('the entry is written with a tag');
    const text = "now() + interval '3 days'";
    expect(sqlExpressionAuthoringEntry.print(written.parse(text))).toBe(text);
  });
});

describe('sqlTextFromCanonical', () => {
  it('returns a string', () => {
    expect(sqlTextFromCanonical('now()')).toBe('now()');
  });

  it.each([[1], [null], [{ text: 'x' }], [['x']]])('throws for %j', (value) => {
    expect(() => sqlTextFromCanonical(value)).toThrow(
      `A sql/expression value is a string, got ${JSON.stringify(value)}.`,
    );
  });
});

describe('printSqlExpressionLiteral', () => {
  it('prints a sql literal', () => {
    expect(printSqlExpressionLiteral('gen_random_uuid()')).toBe('sql`gen_random_uuid()`');
  });
});
