import type { ContractSourceContext } from '@internal/config/config-types';
import {
  assembleAttributeSpecs,
  resolveDescribeUnresolvedType,
  resolveDescribeUnsupportedAttribute,
} from './attribute-spec/assemble';
import type { BinderResult } from './binder';
import { createBinder } from './binder';
import { mergeContributedTypes } from './contributed-type-scope';
import type { PslSources } from './source-file';
import type { SymbolTable } from './symbol-table';

export function createProjectBinder(input: {
  readonly symbolTable: SymbolTable;
  readonly sources: PslSources;
  readonly context: ContractSourceContext;
}): BinderResult {
  const { symbolTable, sources, context } = input;
  const contributions = context.authoringContributions;

  const describeUnsupportedAttributeFactory = resolveDescribeUnsupportedAttribute(
    context.pslDiagnostics,
  );
  const describeUnresolvedTypeFactory = resolveDescribeUnresolvedType(context.pslDiagnostics);

  return createBinder({
    sources,
    symbolTable,
    contributedTypes: mergeContributedTypes(contributions.field, contributions.type),
    attributeSpecs: assembleAttributeSpecs(contributions),
    pslBlockDescriptors: contributions.pslBlockDescriptors,
    controlMutationDefaults: {
      defaultFunctionRegistry: context.controlMutationDefaults.defaultFunctionRegistry,
      dataTypeEntries: contributions.dataTypes,
    },
    ...(describeUnsupportedAttributeFactory !== undefined
      ? { describeUnsupportedAttribute: describeUnsupportedAttributeFactory(sources) }
      : {}),
    ...(describeUnresolvedTypeFactory !== undefined
      ? { describeUnresolvedType: describeUnresolvedTypeFactory(contributions) }
      : {}),
  });
}
