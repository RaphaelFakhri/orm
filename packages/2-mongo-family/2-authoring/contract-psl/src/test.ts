import type { ContractSourceContext } from '@internal/config/config-types';
import type { ControlStack } from '@internal/framework-components/control';

/**
 * Derives the `ContractSourceContext` `interpretPslMongoSources` (and
 * `createProjectBinder`) need from a `ControlStack` a test assembled with
 * `createControlStack`. Mirrors the mapping `loadContractSourceWithStack`
 * applies in production, minus the parts only a running command has
 * (`resolvedInputs`, `reportWarning`).
 */
export function contractSourceContextFromControlStack(
  stack: ControlStack,
  overrides?: Partial<ContractSourceContext>,
): ContractSourceContext {
  return {
    composedExtensions: stack.extensions.map((extension) => extension.id),
    composedExtensionContracts: stack.extensionContracts,
    authoringContributions: stack.authoringContributions,
    codecLookup: stack.codecLookup,
    dataTypeLookup: stack.dataTypeLookup,
    controlMutationDefaults: stack.controlMutationDefaults,
    resolvedInputs: [],
    capabilities: stack.capabilities,
    ...overrides,
  };
}
