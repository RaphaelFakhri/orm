/**
 * Every PSL place that takes raw SQL receives the data type `sql/expression`. A new raw-SQL place
 * written with `str()` must be added here, which makes that choice visible in review.
 */

import { buildSymbolTable, type InspectableArgType } from '@internal/psl-parser';
import { parse } from '@internal/psl-parser/syntax';
import { sqlAttributeSpecs } from '@internal/sql-contract-psl/attribute-specs';
import { describe, expect, it } from 'vitest';
import {
  policyBothPredicatesSpec,
  policyUsingOnlySpec,
  policyWithCheckOnlySpec,
  postgresAuthoringModelAttributes,
} from '../src/core/authoring';
import { postgresDataTypeSupport } from './fixtures/postgres-data-type-support';

const { document, sources } = parse(
  'model Post {\n  id Int @id\n}\npolicy_all p {\n}\n',
  'sql-expression-places.test.psl',
);
const { symbolTable } = buildSymbolTable({ documents: [document], sources });
const model = symbolTable.topLevel.models['Post'];
const block = symbolTable.topLevel.blocks['p'];
if (model === undefined || block === undefined) throw new Error('expected the probe declarations');

const modelContext = {
  symbols: symbolTable,
  model,
  defaultFunctionRegistry: new Map(),
  dataTypes: postgresDataTypeSupport,
};
const blockContext = { symbols: symbolTable, block, dataTypes: postgresDataTypeSupport };

function received(type: InspectableArgType<never> | undefined) {
  return type === undefined
    ? undefined
    : { kind: type.kind, dataType: Reflect.get(type, 'dataType') };
}

const SQL_EXPRESSION = { kind: 'dataTypeValue', dataType: 'sql/expression' };

describe('the places that take raw SQL', () => {
  it('receive sql/expression', () => {
    const index = sqlAttributeSpecs.model.index(modelContext);
    const check = sqlAttributeSpecs.model.check(modelContext);
    const fullTextIndex = postgresAuthoringModelAttributes.fullTextIndex.spec(modelContext);

    expect({
      indexWhere: received(index.named['where']?.type),
      indexExpression: received(index.named['expression']?.type),
      fullTextIndexWhere: received(fullTextIndex.named['where']?.type),
      checkExpression: received(check.named['expression']?.type),
      usingOnlyUsing: received(policyUsingOnlySpec(blockContext).parameters['using']?.type),
      withCheckOnlyWithCheck: received(
        policyWithCheckOnlySpec(blockContext).parameters['withCheck']?.type,
      ),
      bothUsing: received(policyBothPredicatesSpec(blockContext).parameters['using']?.type),
      bothWithCheck: received(policyBothPredicatesSpec(blockContext).parameters['withCheck']?.type),
    }).toEqual({
      indexWhere: SQL_EXPRESSION,
      indexExpression: SQL_EXPRESSION,
      fullTextIndexWhere: SQL_EXPRESSION,
      checkExpression: SQL_EXPRESSION,
      usingOnlyUsing: SQL_EXPRESSION,
      withCheckOnlyWithCheck: SQL_EXPRESSION,
      bothUsing: SQL_EXPRESSION,
      bothWithCheck: SQL_EXPRESSION,
    });
  });
});
