import { describe, expect, it } from 'vitest';
import {
  type FullTextIndexDefinition,
  fullTextIndexDefinitionOf,
  renderFullTextDocument,
  renderFullTextIndexExpression,
  storageOptionsOf,
} from '../src/core/full-text-index-expression';

const nullableColumns = new Set(['subtitle', 'body']);
const isNullable = (column: string) => nullableColumns.has(column);

function render(definition: FullTextIndexDefinition): string {
  return renderFullTextIndexExpression(definition, isNullable);
}

describe('renderFullTextIndexExpression', () => {
  it('renders one field alone as the bare to_tsvector the column operations use', () => {
    expect(render({ fields: [['title']], language: 'english' })).toBe(
      `to_tsvector('english', "title")`,
    );
  });

  it('does not coalesce a nullable field that is the whole document', () => {
    expect(render({ fields: [['body']], language: 'german' })).toBe(
      `to_tsvector('german', "body")`,
    );
  });

  it('joins the fields of one group without weights, coalescing only nullable columns', () => {
    expect(render({ fields: [['title', 'body']], language: 'english' })).toBe(
      `(to_tsvector('english', "title") || to_tsvector('english', coalesce("body", '')))`,
    );
  });

  it('weights each group, A first, when there is more than one group', () => {
    expect(render({ fields: [['title', 'subtitle'], ['body']], language: 'english' })).toBe(
      `(setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("subtitle", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B'))`,
    );
  });

  it('uses the weights A to D for four groups', () => {
    expect(render({ fields: [['a'], ['b'], ['c'], ['d']], language: 'simple' })).toBe(
      `(setweight(to_tsvector('simple', "a"), 'A') || setweight(to_tsvector('simple', "b"), 'B') || setweight(to_tsvector('simple', "c"), 'C') || setweight(to_tsvector('simple', "d"), 'D'))`,
    );
  });

  it('quotes column names that need it', () => {
    expect(render({ fields: [['Body Text']], language: 'english' })).toBe(
      `to_tsvector('english', "Body Text")`,
    );
  });
});

describe('fullTextIndexDefinitionOf', () => {
  it('reads the definition of a gin index whose options name fields', () => {
    expect(
      fullTextIndexDefinitionOf({
        type: 'gin',
        options: { fields: [['title'], ['body']], language: 'german' },
      }),
    ).toEqual({ fields: [['title'], ['body']], language: 'german' });
  });

  it.each([
    ['an index without a type', {}],
    ['a btree index', { type: 'btree', options: { fields: [['title']], language: 'english' } }],
    ['a gin index without fields', { type: 'gin', options: { fastupdate: 'off' } }],
    ['a gin index without options', { type: 'gin' }],
  ])('reads nothing from %s', (_label, index) => {
    expect(fullTextIndexDefinitionOf(index)).toBeUndefined();
  });

  it('refuses malformed full-text options', () => {
    expect(() =>
      fullTextIndexDefinitionOf({ type: 'gin', options: { fields: [[]], language: 'english' } }),
    ).toThrow(expect.objectContaining({ code: 'CONTRACT.INDEX_INVALID' }));
  });
});

describe('storageOptionsOf', () => {
  it('keeps the options other than the full-text definition', () => {
    expect(
      storageOptionsOf({ fields: [['title']], language: 'english', fastupdate: 'off' }),
    ).toEqual({ fastupdate: 'off' });
  });

  it('is undefined when only the full-text definition is left', () => {
    expect(storageOptionsOf({ fields: [['title']], language: 'english' })).toBeUndefined();
  });
});

describe('renderFullTextDocument', () => {
  it('renders any field reference and language syntax it is given', () => {
    expect(
      renderFullTextDocument([[0, 1], [2]], {
        column: (position) => `{{arg${position}}}`,
        isNullable: (position) => position === 2,
        language: '{{arg9}}',
      }),
    ).toBe(
      `(setweight(to_tsvector({{arg9}}, {{arg0}}), 'A') || setweight(to_tsvector({{arg9}}, {{arg1}}), 'A') || setweight(to_tsvector({{arg9}}, coalesce({{arg2}}, '')), 'B'))`,
    );
  });

  it('refuses more than four groups', () => {
    expect(() =>
      renderFullTextDocument([['a'], ['b'], ['c'], ['d'], ['e']], {
        column: (name) => name,
        isNullable: () => false,
        language: `'english'`,
      }),
    ).toThrow(/at most 4/);
  });

  it('refuses an empty group', () => {
    expect(() =>
      renderFullTextDocument([['a'], []], {
        column: (name) => name,
        isNullable: () => false,
        language: `'english'`,
      }),
    ).toThrow(/empty/);
  });
});
