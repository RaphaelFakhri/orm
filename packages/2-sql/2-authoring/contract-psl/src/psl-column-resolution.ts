import type {
  ColumnDefault,
  ExecutionMutationDefaultPhases,
  ValueSetRef,
} from '@internal/contract/types';
import type {
  AuthoringContributions,
  AuthoringEntityTypeDescriptor,
  AuthoringEntityTypeNamespace,
  AuthoringTypeConstructorDescriptor,
} from '@internal/framework-components/authoring';
import {
  checkUncomposedNamespace,
  type DataTypeSupport,
  getAuthoringFieldPreset,
  getAuthoringTypeConstructor,
  hasRegisteredFieldNamespace,
  instantiateAuthoringTypeConstructor,
  isAuthoringEntityTypeDescriptor,
  readWrittenValue,
  validateAuthoringHelperArguments,
  type WrittenScalar,
  type WrittenValue,
} from '@internal/framework-components/authoring';
import type {
  AnyCodecDescriptor,
  CodecLookupWithDescriptors,
} from '@internal/framework-components/codec';
import {
  type ControlMutationDefaultRegistry,
  type DefaultFunctionLoweringContext,
  describeTaggedLiteralFailure,
  type MutationDefaultGeneratorDescriptor,
} from '@internal/framework-components/control';
import type { ContributedPslDiagnosticCode } from '@internal/framework-components/psl-ast';
import type {
  Binder,
  FieldSymbol,
  ModelSymbol,
  ParsedWrittenScalar,
  PslSpan,
  ResolvedTypeConstructorCall,
  SymbolTable,
} from '@internal/psl-parser';
import {
  type DiagnosticSource,
  diagnosticSource,
  nodePslSpan,
  type PslDiagnosticCollector,
} from '@internal/psl-parser';
import {
  instantiatePslFieldPreset,
  mapPslHelperArgs,
  reportUncomposedNamespace,
  reportUnknownFieldPreset,
} from '@internal/psl-parser/interpret';
import type { PslSources } from '@internal/psl-parser/syntax';
import {
  SQL_EXPRESSION_DATA_TYPE_ID,
  SQL_EXPRESSION_TAG,
  sqlTextFromCanonical,
} from '@internal/sql-contract/sql-expression';
import { checkSqlDefaultText, reservedSqlDefaultText } from '@internal/sql-contract/validators';
import type { AuthoredColumnDefault } from '@internal/sql-contract-ts/contract-builder';
import { InternalError, isInternalError } from '@internal/utils/internal-error';
import { contractError } from './contract-errors';
import { type DefaultSpans, lowerDataTypeDefault } from './data-type-default';
import { lowerDefaultFunctionWithRegistry } from './default-function-registry';

import { getAttribute } from './psl-attribute-parsing';
import {
  fieldSpecContext,
  interpretFieldAttribute,
  type ParsedNullLiteral,
  sqlAttributeSpecs,
} from './sql-attribute-specs';
import { type ValueObjectTypes, valueObjectDefaultMismatches } from './value-object-default';

export type ColumnDescriptor = {
  readonly codecId: string;
  readonly nativeType: string;
  readonly typeRef?: string;
  readonly typeParams?: Record<string, unknown> | undefined;
  /**
   * Storage-plane value-set ref, set only by an entity-ref type constructor
   * (e.g. `pg.enum(Ref)`) resolving `Ref` against a document-local
   * value-set-deriving entity. Threaded straight onto the `StorageColumn` —
   * this is what drives value-set → codec typing (`computeColumnType`
   * gating on `column.valueSet`); every other resolution path leaves it
   * unset.
   */
  readonly valueSet?: ValueSetRef;
};

export function toNamedTypeFieldDescriptor(
  typeRef: string,
  descriptor: Pick<ColumnDescriptor, 'codecId' | 'nativeType'>,
): ColumnDescriptor {
  return {
    codecId: descriptor.codecId,
    nativeType: descriptor.nativeType,
    typeRef,
  };
}

/**
 * Walks `authoringContributions.entityTypes` segment-by-segment and returns
 * the entity type descriptor at the resolved path, or `undefined` if no
 * descriptor is registered.
 *
 * Used by the PSL interpreter to dispatch declarative entity-shaped
 * declarations (`enum`, future `namespace { … }`, …) through the
 * pack entity-type mechanism — the descriptor's `factory` (or
 * `template`) materialises the IR-class instance without the
 * interpreter knowing target-specific construction.
 */
export function getAuthoringEntity(
  contributions: AuthoringContributions | undefined,
  path: readonly string[],
): AuthoringEntityTypeDescriptor | undefined {
  let current: AuthoringEntityTypeDescriptor | AuthoringEntityTypeNamespace | undefined =
    contributions?.entityTypes;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null || 'kind' in current) {
      return undefined;
    }
    current = current[segment];
  }

  return current !== undefined && isAuthoringEntityTypeDescriptor(current) ? current : undefined;
}

export function replacesUnresolvedTypeVoice(
  typeName: string,
  composedExtensions: ReadonlySet<string>,
  context: {
    readonly familyId?: string;
    readonly targetId?: string;
    readonly authoringContributions?: AuthoringContributions | undefined;
  },
): boolean {
  if (checkUncomposedNamespace(typeName, composedExtensions, context) !== undefined) {
    return true;
  }
  const dotIndex = typeName.indexOf('.');
  if (dotIndex <= 0 || dotIndex === typeName.length - 1) {
    return false;
  }
  return hasRegisteredFieldNamespace(context.authoringContributions, typeName.slice(0, dotIndex));
}

export function instantiatePslTypeConstructor(input: {
  readonly call: ResolvedTypeConstructorCall;
  readonly descriptor: AuthoringTypeConstructorDescriptor;
  readonly diagnostics: PslDiagnosticCollector;
  readonly source: DiagnosticSource;
  readonly entityLabel: string;
}):
  | {
      readonly codecId: string;
      readonly nativeType: string;
      readonly typeParams?: Record<string, unknown>;
    }
  | undefined {
  const helperPath = input.call.path.join('.');
  const args = mapPslHelperArgs({
    args: input.call.args,
    descriptors: input.descriptor.args ?? [],
    helperLabel: `constructor "${helperPath}"`,
    span: input.call.span,
    diagnostics: input.diagnostics,
    source: input.source,
    entityLabel: input.entityLabel,
  });
  if (!args) {
    return undefined;
  }

  try {
    validateAuthoringHelperArguments(helperPath, input.descriptor.args, args);
    return instantiateAuthoringTypeConstructor(input.descriptor, args);
  } catch (error) {
    if (isInternalError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    input.diagnostics.push({
      code: 'PSL_INVALID_ATTRIBUTE_ARGUMENT',
      message: `${input.entityLabel} constructor "${helperPath}" ${message}`,
      ...input.source.at(input.call.span),
    });
    return undefined;
  }
}

function pushUnsupportedTypeConstructorDiagnostic(input: {
  readonly diagnostics: PslDiagnosticCollector;
  readonly source: DiagnosticSource;
  readonly span: PslSpan;
  readonly code: 'PSL_UNSUPPORTED_FIELD_TYPE' | 'PSL_UNSUPPORTED_NAMED_TYPE_CONSTRUCTOR';
  readonly message: string;
}): undefined {
  input.diagnostics.push({
    code: input.code,
    message: input.message,
    ...input.source.at(input.span),
  });
  return undefined;
}

export function resolvePslTypeConstructorDescriptor(input: {
  readonly call: ResolvedTypeConstructorCall;
  readonly authoringContributions: AuthoringContributions | undefined;
  readonly composedExtensions: ReadonlySet<string>;
  readonly familyId: string;
  readonly targetId: string;
  readonly diagnostics: PslDiagnosticCollector;
  readonly source: DiagnosticSource;
  readonly unsupportedCode: 'PSL_UNSUPPORTED_FIELD_TYPE' | 'PSL_UNSUPPORTED_NAMED_TYPE_CONSTRUCTOR';
  readonly unsupportedMessage: string;
}): AuthoringTypeConstructorDescriptor | undefined {
  const descriptor = getAuthoringTypeConstructor(input.authoringContributions, input.call.path);
  if (descriptor) {
    return descriptor;
  }

  const uncomposedNamespace = checkUncomposedNamespace(
    input.call.path.join('.'),
    input.composedExtensions,
    {
      familyId: input.familyId,
      targetId: input.targetId,
      authoringContributions: input.authoringContributions,
    },
  );
  if (uncomposedNamespace) {
    reportUncomposedNamespace({
      subjectLabel: `Type constructor "${input.call.path.join('.')}"`,
      namespace: uncomposedNamespace,
      source: input.source,
      span: input.call.span,
      diagnostics: input.diagnostics,
    });
    return undefined;
  }

  return pushUnsupportedTypeConstructorDiagnostic({
    diagnostics: input.diagnostics,
    source: input.source,
    span: input.call.span,
    code: input.unsupportedCode,
    message: input.unsupportedMessage,
  });
}

/**
 * Result of a codec descriptor's `columnFromEntity` authoring hook — the
 * per-column params derived from the entity a type constructor's
 * `entityRefArg` resolved to. `nativeType` mirrors what the codec descriptor's
 * `nativeTypeFor` derives from the same `typeParams` at render time, so the
 * column's declared native type and the render-time cast agree.
 */
interface EntityRefColumnFromEntityResult {
  readonly typeParams?: Record<string, unknown>;
  readonly nativeType: string;
}

interface EntityRefResolvingCodecDescriptor extends AnyCodecDescriptor {
  readonly columnFromEntity: (entity: unknown) => EntityRefColumnFromEntityResult | undefined;
}

/**
 * Structural check for a codec descriptor exposing the authoring-time
 * `columnFromEntity` hook a type constructor's `entityRefArg` resolves
 * through (e.g. the `pg/enum@1` codec descriptor). No casts.
 */
function hasColumnFromEntityHook(
  descriptor: AnyCodecDescriptor,
): descriptor is EntityRefResolvingCodecDescriptor {
  return 'columnFromEntity' in descriptor && typeof descriptor.columnFromEntity === 'function';
}

/**
 * Resolves a type-constructor call whose descriptor declares an
 * `entityRefArg` (e.g. `pg.enum(AalLevel)`): extracts the call's sole
 * positional-argument ref string, resolves it against the field's
 * namespace's already-lowered extension entities (keyed by the declared
 * `entityRefArg.entityKind`, then block name), and converts the resolved
 * entity to column params via the `columnFromEntity` authoring hook on the
 * codec descriptor registered for `descriptor.output.codecId`. The `nativeType`
 * / `typeParams.typeName` `columnFromEntity` returns are bare — schema
 * qualification (e.g. `auth.aal_level`) is a target concern, applied later
 * when the target builds the field's namespace. A `valueSet` ref is
 * attached when the same namespace derived a value-set under the same block
 * name (the generic `deriveValueSet` mechanism), scoped to the field's own
 * namespace.
 */
function resolveEntityRefTypeConstructorCall(input: {
  readonly call: ResolvedTypeConstructorCall;
  readonly descriptor: AuthoringTypeConstructorDescriptor;
  readonly namespaceId: string | undefined;
  readonly namespaceExtensionEntities:
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  readonly codecLookup: CodecLookupWithDescriptors | undefined;
  readonly diagnostics: PslDiagnosticCollector;
  readonly source: DiagnosticSource;
  readonly entityLabel: string;
}): ResolveFieldTypeResult {
  const entityRefArg = input.descriptor.entityRefArg;
  if (entityRefArg === undefined) {
    throw new InternalError(
      'resolveEntityRefTypeConstructorCall called with a descriptor that does not declare an entityRefArg. This is an interpreter bug.',
    );
  }

  const helperPath = input.call.path.join('.');
  const positionalArgs = input.call.args.filter((arg) => arg.kind === 'positional');
  const ref = positionalArgs[entityRefArg.index]?.value;
  if (input.call.args.length !== 1 || positionalArgs.length !== 1 || ref === undefined) {
    input.diagnostics.push({
      code: 'PSL_INVALID_ATTRIBUTE_ARGUMENT',
      message: `${input.entityLabel} type constructor "${helperPath}" expects exactly one positional argument naming the referenced entity`,
      ...input.source.at(input.call.span),
    });
    return { ok: false, alreadyReported: true };
  }

  const reportUnknownRef = (): ResolveFieldTypeResult => {
    input.diagnostics.push({
      code: 'PSL_UNKNOWN_ENTITY_REF',
      message: `${input.entityLabel} type constructor "${helperPath}(${ref})" does not resolve — no entity named "${ref}" was found in namespace "${input.namespaceId ?? '(unspecified)'}"`,
      ...input.source.at(input.call.span),
    });
    return { ok: false, alreadyReported: true };
  };

  const entity = input.namespaceExtensionEntities?.[entityRefArg.entityKind]?.[ref];
  if (entity === undefined) {
    return reportUnknownRef();
  }

  const codecId = input.descriptor.output.codecId;
  const codecDescriptor = input.codecLookup?.descriptorFor(codecId);
  if (codecDescriptor === undefined || !hasColumnFromEntityHook(codecDescriptor)) {
    throw contractError(
      'CONTRACT.PACK_CONTRIBUTION_INVALID',
      `Type constructor "${helperPath}" registers codecId "${codecId}" with an entity-ref argument, but its codec descriptor has no "columnFromEntity" authoring hook. This is a contributor bug in the pack registering "${helperPath}", not a user-schema error.`,
      { meta: { helperPath, codecId } },
    );
  }

  const resolved = codecDescriptor.columnFromEntity(entity);
  if (resolved === undefined) {
    return reportUnknownRef();
  }

  const derivedValueSet = input.namespaceExtensionEntities?.['valueSet']?.[ref];
  if (derivedValueSet !== undefined && input.namespaceId === undefined) {
    input.diagnostics.push({
      code: 'PSL_INVALID_ATTRIBUTE_ARGUMENT',
      message: `${input.entityLabel} type constructor "${helperPath}(${ref})" resolves to a value-set-typed entity, but the field has no resolvable namespace to scope the value-set ref to`,
      ...input.source.at(input.call.span),
    });
    return { ok: false, alreadyReported: true };
  }

  const valueSet: ValueSetRef | undefined =
    derivedValueSet !== undefined && input.namespaceId !== undefined
      ? {
          plane: 'storage',
          entityKind: 'valueSet',
          namespaceId: input.namespaceId,
          entityName: ref,
        }
      : undefined;

  return {
    ok: true,
    descriptor: {
      codecId,
      nativeType: resolved.nativeType,
      ...(resolved.typeParams !== undefined ? { typeParams: resolved.typeParams } : {}),
      ...(valueSet !== undefined ? { valueSet } : {}),
    },
  };
}

/**
 * Contract contributions a field preset adds beyond the bare storage-type triple. Set when a field is resolved through the field-preset dispatch path; absent when resolved through the type-constructor path or as a scalar/enum/named-type lookup.
 */
export type FieldPresetContributions = {
  readonly nullable: boolean;
  readonly id: boolean;
  readonly unique: boolean;
  readonly default?: ColumnDefault;
  readonly executionDefaults?: ExecutionMutationDefaultPhases;
};

export type ResolveFieldTypeResult =
  | {
      readonly ok: true;
      readonly descriptor: ColumnDescriptor;
      readonly presetContributions?: FieldPresetContributions;
    }
  | { readonly ok: false; readonly alreadyReported: boolean };

export function resolveFieldTypeDescriptor(input: {
  readonly field: FieldSymbol;
  readonly enumTypeDescriptors: ReadonlyMap<string, ColumnDescriptor>;
  readonly namedTypeDescriptors: ReadonlyMap<string, ColumnDescriptor>;
  readonly scalarColumnDescriptors: ReadonlyMap<string, ColumnDescriptor>;
  readonly authoringContributions: AuthoringContributions | undefined;
  readonly composedExtensions: ReadonlySet<string>;
  readonly familyId: string;
  readonly targetId: string;
  readonly diagnostics: PslDiagnosticCollector;
  readonly sources: PslSources;
  readonly entityLabel: string;
  /**
   * The field's namespace id — required to build a `valueSet` ref (`{
   * namespaceId, entityName, … }`) when an entity-ref type constructor
   * resolves the field's type. Storage value-sets are namespace-scoped, so
   * the ref must point at the value-set derived in the SAME namespace the
   * field's own column lives in.
   */
  readonly namespaceId?: string;
  /**
   * Extension entities already lowered for this namespace (the exact shape
   * `lowerExtensionBlocksForNamespace` in the interpreter produces), keyed
   * by entries-slot discriminator then block name. Consulted only when a
   * type constructor's descriptor declares an `entityRefArg` (e.g.
   * `pg.enum(Ref)`); every other resolution path ignores it.
   */
  readonly namespaceExtensionEntities?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * Codec-id-keyed descriptor lookup — consulted only when a type
   * constructor's descriptor declares an `entityRefArg`, to reach the
   * registered codec's `columnFromEntity` authoring hook.
   */
  readonly codecLookup?: CodecLookupWithDescriptors;
}): ResolveFieldTypeResult {
  const source = diagnosticSource(input.sources, input.field.node.syntax);
  // Avoid cascading unsupported-type diagnostics after invalid qualification.
  if (input.field.malformedType) {
    return { ok: false, alreadyReported: true };
  }
  if (input.field.typeConstructor) {
    // Field presets carry richer semantics than type constructors, so a field preset match is the complete answer. Shared composition rejects exact cross-registry collisions before PSL resolution can observe them.
    const presetDescriptor = getAuthoringFieldPreset(
      input.authoringContributions,
      input.field.typeConstructor.path,
    );
    if (presetDescriptor) {
      const instantiated = instantiatePslFieldPreset({
        call: input.field.typeConstructor,
        descriptor: presetDescriptor,
        diagnostics: input.diagnostics,
        source,
        entityLabel: input.entityLabel,
      });
      if (!instantiated) {
        return { ok: false, alreadyReported: true };
      }
      const presetContributions: FieldPresetContributions = {
        nullable: instantiated.nullable,
        id: instantiated.id,
        unique: instantiated.unique,
        ...(instantiated.default !== undefined ? { default: instantiated.default } : {}),
        ...(instantiated.executionDefaults !== undefined
          ? { executionDefaults: instantiated.executionDefaults }
          : {}),
      };
      return { ok: true, descriptor: instantiated.descriptor, presetContributions };
    }

    const helperPath = input.field.typeConstructor.path.join('.');
    const namespacePrefix =
      input.field.typeConstructor.path.length > 1 ? input.field.typeConstructor.path[0] : undefined;
    const typeDescriptor = getAuthoringTypeConstructor(
      input.authoringContributions,
      input.field.typeConstructor.path,
    );

    if (typeDescriptor?.entityRefArg) {
      return resolveEntityRefTypeConstructorCall({
        call: input.field.typeConstructor,
        descriptor: typeDescriptor,
        namespaceId: input.namespaceId,
        namespaceExtensionEntities: input.namespaceExtensionEntities,
        codecLookup: input.codecLookup,
        diagnostics: input.diagnostics,
        source,
        entityLabel: input.entityLabel,
      });
    }

    if (
      !typeDescriptor &&
      namespacePrefix &&
      hasRegisteredFieldNamespace(input.authoringContributions, namespacePrefix)
    ) {
      reportUnknownFieldPreset({
        entityLabel: input.entityLabel,
        namespace: namespacePrefix,
        helperPath,
        authoringContributions: input.authoringContributions,
        source,
        span: input.field.typeConstructor.span,
        diagnostics: input.diagnostics,
      });
      return { ok: false, alreadyReported: true };
    }

    const descriptor =
      typeDescriptor ??
      resolvePslTypeConstructorDescriptor({
        call: input.field.typeConstructor,
        authoringContributions: input.authoringContributions,
        composedExtensions: input.composedExtensions,
        familyId: input.familyId,
        targetId: input.targetId,
        diagnostics: input.diagnostics,
        source,
        unsupportedCode: 'PSL_UNSUPPORTED_FIELD_TYPE',
        unsupportedMessage: `${input.entityLabel} type constructor "${helperPath}" is not supported in SQL PSL provider v1`,
      });
    if (!descriptor) {
      return { ok: false, alreadyReported: true };
    }

    const instantiated = instantiatePslTypeConstructor({
      call: input.field.typeConstructor,
      descriptor,
      diagnostics: input.diagnostics,
      source,
      entityLabel: input.entityLabel,
    });
    if (!instantiated) {
      return { ok: false, alreadyReported: true };
    }
    return { ok: true, descriptor: instantiated };
  }

  const descriptor = resolveColumnDescriptor(
    input.field,
    input.enumTypeDescriptors,
    input.namedTypeDescriptors,
    input.scalarColumnDescriptors,
  );
  if (!descriptor) {
    return { ok: false, alreadyReported: false };
  }
  return { ok: true, descriptor };
}

const PSL_INVALID_DEFAULT_SQL: ContributedPslDiagnosticCode = 'PSL_INVALID_DEFAULT_SQL';

const TAGGED_LITERAL_CANONICALIZATION_CODES = {
  nul: 'PSL_TAGGED_LITERAL_NUL',
  'too-large': 'PSL_TAGGED_LITERAL_TOO_LARGE',
} as const;

/**
 * Refuses a `null` element in the list default of a field whose list elements are not nullable,
 * at the first `null`. Returns whether it refused.
 */
export function rejectStrictListNullDefault(input: {
  readonly field: FieldSymbol;
  readonly modelName: string;
  readonly elements: readonly { readonly kind: string }[];
  readonly source: DiagnosticSource;
  readonly diagnostics: PslDiagnosticCollector;
}): boolean {
  if (input.field.elementOptional) return false;
  const nullElement = input.elements.find(isParsedNullLiteral);
  if (nullElement === undefined) return false;
  input.diagnostics.push({
    code: 'PSL_INVALID_DEFAULT_APPLICABILITY',
    message: `Field "${input.modelName}.${input.field.name}" has strict list elements and cannot use null in a literal list default. Make the element type nullable or remove null from the default.`,
    ...input.source.at(nullElement.span),
  });
  return true;
}

function isParsedNullLiteral(element: { readonly kind: string }): element is ParsedNullLiteral {
  return element.kind === 'null';
}

export function lowerDefaultForField(input: {
  readonly modelName: string;
  readonly fieldName: string;
  readonly field: FieldSymbol;
  readonly model: ModelSymbol;
  readonly symbolTable: SymbolTable;
  readonly sources: PslSources;
  readonly binder: Binder;
  readonly columnDescriptor: ColumnDescriptor;
  /** Whether the field is stored in a list column. A list of value objects is not: its one column holds the whole list as one JSON array. */
  readonly isListColumn: boolean;
  /** For a field typed by a value object, the value objects a literal default is checked against. */
  readonly valueObjectDefault:
    | { readonly valueObjectName: string; readonly types: ValueObjectTypes }
    | undefined;
  readonly generatorDescriptorById: ReadonlyMap<string, MutationDefaultGeneratorDescriptor>;
  readonly defaultFunctionRegistry: ControlMutationDefaultRegistry;
  readonly dataTypes: DataTypeSupport;
  readonly codecLookup: CodecLookupWithDescriptors | undefined;
  readonly diagnostics: PslDiagnosticCollector;
}): {
  readonly defaultValue?: AuthoredColumnDefault;
  readonly executionDefaults?: ExecutionMutationDefaultPhases;
} {
  const node = getAttribute(input.field.attributes, 'default')?.node;
  if (node === undefined) return {};
  const source = diagnosticSource(input.sources, node.syntax);
  const spec = sqlAttributeSpecs.field.default(
    fieldSpecContext({
      symbols: input.symbolTable,
      model: input.model,
      field: input.field,
      defaultFunctionRegistry: input.defaultFunctionRegistry,
      dataTypes: input.dataTypes,
    }),
  );
  const interpreted = interpretFieldAttribute({
    symbols: input.symbolTable,
    node,
    spec,
    model: input.model,
    field: input.field,
    sources: input.sources,
    binder: input.binder,
    diagnostics: input.diagnostics,
  });
  if (interpreted === undefined) return {};
  const value = interpreted.value;
  const attributeSpan = nodePslSpan(node.syntax, input.sources);
  if (value.kind === 'null') {
    if (!input.field.optional) {
      input.diagnostics.push({
        code: 'PSL_INVALID_DEFAULT_APPLICABILITY',
        message: `Field "${input.modelName}.${input.fieldName}" is non-nullable and cannot use null as its literal default. Make the field nullable or use a non-null default.`,
        ...source.at(),
      });
      return {};
    }
    return { defaultValue: { kind: 'literal', value: null, canonical: true } };
  }
  if (
    value.kind === 'list' &&
    rejectStrictListNullDefault({ ...input, elements: value.elements, source })
  )
    return {};
  // A list of value objects is stored in one column whose value is the whole list: a list literal
  // fills it element by element, as it fills a list column, and any other literal is read as the
  // whole value.
  const readsListElements = (written: WrittenValue) =>
    input.isListColumn || (input.field.list && written.kind === 'list');
  const readAsLiteral = (
    written: WrittenValue,
    spans: DefaultSpans,
    sourceElementIndexes?: readonly number[],
  ) => {
    const lowered = lowerDataTypeDefault({
      written,
      spans,
      sourceElementIndexes,
      isList: readsListElements(written),
      column: input.columnDescriptor,
      codecLookup: input.codecLookup,
      dataTypes: input.dataTypes,
      fieldPath: `${input.modelName}.${input.fieldName}`,
    });
    if (!lowered.ok) {
      input.diagnostics.push({
        code: lowered.code,
        message: lowered.message,
        ...source.at(lowered.span),
      });
      return {};
    }
    let restoredValue = lowered.value;
    if (
      value.kind === 'list' &&
      value.elements.some(isParsedNullLiteral) &&
      Array.isArray(lowered.value)
    ) {
      let index = 0;
      const nonNullValues = lowered.value;
      restoredValue = value.elements.map((element) =>
        element.kind === 'null' ? null : (nonNullValues[index++] ?? null),
      );
    }
    if (input.valueObjectDefault !== undefined) {
      const mismatches = valueObjectDefaultMismatches({
        fieldPath: `${input.modelName}.${input.fieldName}`,
        value: restoredValue,
        list: input.field.list,
        nullable: input.field.optional,
        elementNullable: input.field.elementOptional,
        ...input.valueObjectDefault,
        codecLookup: input.codecLookup,
      });
      for (const { code, message } of mismatches) {
        input.diagnostics.push({ code, message, ...source.at() });
      }
      if (mismatches.length > 0) return {};
    }
    return { defaultValue: { kind: 'literal' as const, value: restoredValue, canonical: true } };
  };

  const canonicalized = (scalar: ParsedWrittenScalar): WrittenScalar | undefined => {
    if (scalar.written !== undefined) return scalar.written;
    input.diagnostics.push({
      code: TAGGED_LITERAL_CANONICALIZATION_CODES[scalar.reason],
      message: describeTaggedLiteralFailure(scalar.reason),
      ...source.at(scalar.span),
    });
    return undefined;
  };

  const sqlExpressionDefault = (text: string, span: PslSpan) => {
    const reserved = reservedSqlDefaultText(text);
    const refusal =
      reserved === undefined
        ? checkSqlDefaultText(text)
        : `Write @default(${reserved}()) instead of ${SQL_EXPRESSION_TAG}\`${reserved}()\`; ${reserved}() is a Prisma default function, not raw SQL.`;
    if (refusal !== undefined) {
      input.diagnostics.push({
        code: PSL_INVALID_DEFAULT_SQL,
        message: refusal,
        ...source.at(span),
      });
      return {};
    }
    return { defaultValue: { kind: 'function' as const, expression: text } };
  };

  // An enum member identifier or list of them is lowered against its enum's handle, which a field without one lacks.
  if (value.kind === 'member' || value.kind === 'member-list') return {};

  // A column bound to a value set (`pg.enum(Ref)`) takes member names, which are checked against the
  // value set rather than read as literals; its codec accepts no literal default at all.
  if (input.columnDescriptor.valueSet !== undefined) {
    const memberName = (element: ParsedWrittenScalar | ParsedNullLiteral) =>
      element.kind === 'scalar' && element.written?.kind === 'string'
        ? element.written.text
        : undefined;
    if (value.kind === 'scalar') {
      const member = memberName(value);
      if (member !== undefined) return { defaultValue: { kind: 'literal', value: member } };
    }
    if (value.kind === 'list') {
      const members = value.elements.map((element) =>
        element.kind === 'null' ? null : memberName(element),
      );
      if (members.every((member) => member !== undefined)) {
        return { defaultValue: { kind: 'literal', value: members } };
      }
    }
  }

  if (value.kind === 'list') {
    const elements: WrittenValue[] = [];
    const sourceElementIndexes: number[] = [];
    for (const [sourceIndex, element] of value.elements.entries()) {
      if (element.kind === 'null') continue;
      const written = canonicalized(element);
      if (written === undefined) return {};
      elements.push(written);
      sourceElementIndexes.push(sourceIndex);
    }
    return readAsLiteral(
      { kind: 'list', elements },
      {
        attribute: attributeSpan,
        value: value.span,
        elements: value.elements.map((element) => element.span),
      },
      sourceElementIndexes,
    );
  }

  if (value.kind === 'scalar') {
    const written = canonicalized(value);
    if (written === undefined) return {};
    const spans = { attribute: attributeSpan, value: value.span, elements: [] };
    if (written.kind !== 'tag') return readAsLiteral(written, spans);
    const read = readWrittenValue(input.dataTypes, written);
    if (read.ok && read.value.type === SQL_EXPRESSION_DATA_TYPE_ID) {
      return sqlExpressionDefault(sqlTextFromCanonical(read.value.value), value.span);
    }
    return readAsLiteral(written, spans);
  }

  const { call } = value;
  const context: DefaultFunctionLoweringContext = {
    sourceId: input.sources.sourceFileFor(node.syntax).filename,
    modelName: input.modelName,
    fieldName: input.fieldName,
    columnCodecId: input.columnDescriptor.codecId,
  };
  const lowered = lowerDefaultFunctionWithRegistry({
    call,
    registry: input.defaultFunctionRegistry,
    context,
    source,
  });

  if (!lowered.ok) {
    if (lowered.kind === 'owned') input.diagnostics.push(lowered.diagnostic);
    else input.diagnostics.pushExternal(lowered.diagnostic);
    return {};
  }

  if (lowered.value.kind === 'storage') {
    return { defaultValue: lowered.value.defaultValue };
  }

  const generatorDescriptor = input.generatorDescriptorById.get(lowered.value.generated.id);
  if (!generatorDescriptor) {
    input.diagnostics.push({
      code: 'PSL_INVALID_DEFAULT_APPLICABILITY',
      message: `Default generator "${lowered.value.generated.id}" is not available in the composed mutation default registry.`,
      ...source.at(call.span),
    });
    return {};
  }

  // Preset-only generators (e.g. `timestampNow`) co-register their codec through the preset descriptor, so they don't carry an `applicableCodecIds` list. Such a generator surfacing on the `@default(...)` lowering path is itself the bug — emit a diagnostic pointing the user at the correct authoring surface.
  if (generatorDescriptor.applicableCodecIds === undefined) {
    input.diagnostics.push({
      code: 'PSL_INVALID_DEFAULT_APPLICABILITY',
      message: `Default generator "${generatorDescriptor.id}" is not applicable to "@default(...)" lowering. Use the corresponding field preset (e.g. \`temporal.${generatorDescriptor.id === 'timestampNow' ? 'updatedAt' : generatorDescriptor.id}()\`) instead.`,
      ...source.at(call.span),
    });
    return {};
  }

  if (!generatorDescriptor.applicableCodecIds.includes(input.columnDescriptor.codecId)) {
    input.diagnostics.push({
      code: 'PSL_INVALID_DEFAULT_APPLICABILITY',
      message: `Default generator "${generatorDescriptor.id}" is not applicable to "${input.modelName}.${input.fieldName}" with codecId "${input.columnDescriptor.codecId}".`,
      ...source.at(call.span),
    });
    return {};
  }

  return { executionDefaults: { onCreate: lowered.value.generated } };
}

export function resolveColumnDescriptor(
  field: FieldSymbol,
  enumTypeDescriptors: ReadonlyMap<string, ColumnDescriptor>,
  namedTypeDescriptors: ReadonlyMap<string, ColumnDescriptor>,
  scalarColumnDescriptors: ReadonlyMap<string, ColumnDescriptor>,
): ColumnDescriptor | undefined {
  if (namedTypeDescriptors.has(field.typeName)) {
    return namedTypeDescriptors.get(field.typeName);
  }
  if (enumTypeDescriptors.has(field.typeName)) {
    return enumTypeDescriptors.get(field.typeName);
  }
  return scalarColumnDescriptors.get(field.typeName);
}
