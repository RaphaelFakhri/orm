import { ok } from '@internal/utils/result';
import { describe, expect, it } from 'vitest';
import { EMPTY_DATA_TYPES } from '../src/attribute-spec/spec-context';
import { createBinder } from '../src/binder';
import type { AttributeCtx } from '../src/exports';
import { bool, numLiteral, str, taggedLiteral, writtenScalar } from '../src/exports';
import { Cursor, parseAttribute } from '../src/parse';
import { PslSources } from '../src/source-file';
import { FieldAttributeAst } from '../src/syntax/ast/attributes';
import type { ExpressionAst } from '../src/syntax/ast/expressions';
import { createSyntaxTree } from '../src/syntax/red';

function argOf(source: string): { expr: ExpressionAst; ctx: AttributeCtx } {
  const cursor = new Cursor('schema.prisma', `@x(${source})`);
  const root = createSyntaxTree(parseAttribute(cursor));
  const expr = [...(FieldAttributeAst.cast(root)?.argList()?.args() ?? [])][0]?.value();
  if (expr === undefined) throw new Error('expected an argument expression');
  const sources = new PslSources([[root, cursor.sourceFile]]);
  const symbols = {
    topLevel: { namespaces: {}, models: {}, compositeTypes: {}, namedTypes: {}, blocks: {} },
  };
  const { binder } = createBinder({
    sources,
    symbolTable: symbols,
    typeConstructors: {},
    attributeSpecs: { model: {}, field: {} },
    defaultFunctionRegistry: new Map(),
    dataTypes: EMPTY_DATA_TYPES,
  });
  return { expr, ctx: { sources, symbols, binder } };
}

/** The span of the argument `source`, which starts after `@x(` on the first line. */
function spanOf(source: string) {
  return {
    start: { offset: 3, line: 1, column: 4 },
    end: { offset: 3 + source.length, line: 1, column: 4 + source.length },
  };
}

const tag = taggedLiteral(['json'], { documentation: 'A JSON document.' });

describe('writtenScalar', () => {
  it('keeps the kind and metadata of the arm it wraps', () => {
    const wrapped = writtenScalar(tag);
    expect({
      kind: wrapped.kind,
      label: wrapped.label,
      tags: Reflect.get(wrapped, 'tags'),
      documentation: Reflect.get(wrapped, 'documentation'),
    }).toEqual({
      kind: 'taggedLiteral',
      label: 'json`...`',
      tags: ['json'],
      documentation: 'A JSON document.',
    });
  });

  it.each([
    ['a string', str(), '"x"', { kind: 'string', text: 'x' }],
    ['a number', numLiteral(), '-1.50', { kind: 'number', text: '-1.50' }],
    ['a boolean', bool(), 'false', { kind: 'boolean', value: false }],
    ['a tagged literal', tag, 'json`  [1]`', { kind: 'tag', tag: 'json', text: '[1]' }],
  ])('yields %s as a written scalar with its span', (_, arm, source, written) => {
    const { expr, ctx } = argOf(source);
    expect(writtenScalar(arm).parse(expr, ctx)).toEqual(
      ok({ ok: true, written, span: spanOf(source) }),
    );
  });

  it('yields why a tagged literal cannot be canonicalized, with its span', () => {
    const source = 'json`a\0b`';
    const { expr, ctx } = argOf(source);
    expect(writtenScalar(tag).parse(expr, ctx)).toEqual(
      ok({ ok: false, reason: 'nul', span: spanOf(source) }),
    );
  });

  it('returns the refusal of the arm it wraps', () => {
    const { expr, ctx } = argOf('true');
    expect(writtenScalar(str()).parse(expr, ctx)).toEqual(str().parse(expr, ctx));
  });
});
