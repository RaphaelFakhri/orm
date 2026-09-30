import {
  admittedTags,
  castTypedValue,
  type DataTypeSupport,
  describeAdmittedForms,
  printTaggedLiteral,
  readWrittenValue,
} from '@internal/framework-components/authoring';
import type { DataTypeId } from '@internal/framework-components/codec';
import { describeTaggedLiteralFailure } from '@internal/framework-components/control';
import { InternalError } from '@internal/utils/internal-error';
import { notOk, ok, type Result } from '@internal/utils/result';
import type { PslDiagnostic } from '../../diagnostic';
import { nodePslSpan } from '../../resolve';
import type { ExpressionAst } from '../../syntax/ast/expressions';
import { readWrittenLiteral } from '../../written-literal';
import type { AttributeCtx, DataTypeValueArgType, ParsedTypedValue } from '../types';
import { leafDiagnostic } from './diagnostic';

const TAGGED_LITERAL_FAILURE_CODES = {
  nul: 'PSL_TAGGED_LITERAL_NUL',
  'too-large': 'PSL_TAGGED_LITERAL_TOO_LARGE',
} as const;

/** An argument typed by a data type: any literal, admitted by the ADR 254 cast rule. Used as a parameter of a `funcCall`. ADR 256. */
export function dataTypeValue(
  dataType: DataTypeId,
  support: DataTypeSupport,
): DataTypeValueArgType<AttributeCtx> {
  const tags = admittedTags(support, dataType);
  const [firstTag] = tags;
  return {
    kind: 'dataTypeValue',
    label: firstTag === undefined ? dataType : `${firstTag}\`...\``,
    dataType,
    tags,
    documentation: support.entries[dataType]?.documentation ?? '',
    parse: (arg, ctx) => parseDataTypeValue(arg, ctx, dataType, support, firstTag),
  };
}

function parseDataTypeValue(
  arg: ExpressionAst,
  ctx: AttributeCtx,
  dataType: DataTypeId,
  support: DataTypeSupport,
  firstTag: string | undefined,
): Result<ParsedTypedValue, readonly PslDiagnostic[]> {
  if (!support.lookup.has(dataType)) {
    throw new InternalError(
      `An argument receives data type "${dataType}", which this stack does not register.`,
    );
  }
  const refuse = (code: string, message: string) =>
    notOk([leafDiagnostic(ctx, arg, message, code)]);
  const forms = describeAdmittedForms(support, dataType);

  const literal = readWrittenLiteral(arg);
  if (!literal.ok) {
    return literal.reason === 'not-a-literal'
      ? refuse('PSL_INVALID_ATTRIBUTE_SYNTAX', `Expected ${forms}, got ${literal.found}`)
      : refuse(
          TAGGED_LITERAL_FAILURE_CODES[literal.reason],
          describeTaggedLiteralFailure(literal.reason),
        );
  }

  const read = readWrittenValue(support, literal.written);
  if (!read.ok) {
    const refusal = read.failure;
    switch (refusal.kind) {
      case 'unknown-tag':
        return refuse(
          'PSL_UNKNOWN_LITERAL_TAG',
          `Unknown literal tag "${refusal.tag}". Known tags: ${refusal.known.join(', ')}.`,
        );
      case 'unwritable':
        return refuse(
          'PSL_VALUE_TYPE_INCOMPATIBLE',
          `This target has no data type for a ${refusal.syntax} value; write ${forms}`,
        );
      case 'unreadable':
        return refuse('PSL_INVALID_LITERAL', refusal.message);
    }
  }

  const cast = castTypedValue(support, dataType, read.value);
  if (!cast.ok) {
    const refusal = cast.failure;
    if (refusal.kind === 'unreadable') return refuse('PSL_INVALID_LITERAL', refusal.message);
    const rewrite =
      literal.written.kind === 'string' && firstTag !== undefined
        ? `write it as ${printTaggedLiteral(firstTag, literal.written.text)}`
        : `write ${forms}`;
    return refuse(
      'PSL_VALUE_TYPE_INCOMPATIBLE',
      `${dataType} has no cast from ${refusal.valueType}; ${rewrite}`,
    );
  }

  return ok({
    type: dataType,
    value: cast.value.value,
    span: nodePslSpan(arg.syntax, ctx.sources),
  });
}
