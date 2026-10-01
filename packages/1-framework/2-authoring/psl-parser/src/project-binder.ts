import type { ContractSourceContext } from '@internal/config/config-types';
import type {
  AuthoringFieldNamespace,
  AuthoringTypeConstructorDescriptor,
  AuthoringTypeNamespace,
} from '@internal/framework-components/authoring';
import {
  collectScalarTypeConstructors,
  isAuthoringFieldPresetDescriptor,
} from '@internal/framework-components/authoring';
import {
  assembleAttributeSpecs,
  resolveDescribeUnresolvedType,
  resolveDescribeUnsupportedAttribute,
} from './attribute-spec/assemble';
import type { BinderResult } from './binder';
import { createBinder } from './binder';
import type { PslSources } from './source-file';
import type { SymbolTable } from './symbol-table';

export function fieldPresetsAsTypeNames(
  namespace: AuthoringFieldNamespace | undefined,
): AuthoringTypeNamespace {
  if (namespace === undefined) return {};
  const result: Record<string, AuthoringTypeConstructorDescriptor | AuthoringTypeNamespace> = {};
  for (const [name, value] of Object.entries(namespace)) {
    result[name] = isAuthoringFieldPresetDescriptor(value)
      ? { kind: 'typeConstructor', output: { codecId: value.output.codecId } }
      : fieldPresetsAsTypeNames(value);
  }
  return result;
}

export function createProjectBinder(input: {
  readonly symbolTable: SymbolTable;
  readonly sources: PslSources;
  readonly context: ContractSourceContext;
}): BinderResult {
  const { symbolTable, sources, context } = input;
  const contributions = context.authoringContributions;

  const scalars: Record<string, AuthoringTypeConstructorDescriptor> = {};
  for (const [name, output] of collectScalarTypeConstructors(contributions.type)) {
    scalars[name] = { kind: 'typeConstructor', output: { codecId: output.codecId } };
  }

  const describeUnsupportedAttributeFactory = resolveDescribeUnsupportedAttribute(
    context.pslDiagnostics,
  );
  const describeUnresolvedTypeFactory = resolveDescribeUnresolvedType(context.pslDiagnostics);

  return createBinder({
    sources,
    symbolTable,
    typeConstructors: {
      ...scalars,
      ...fieldPresetsAsTypeNames(contributions.field),
      ...contributions.type,
    },
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
