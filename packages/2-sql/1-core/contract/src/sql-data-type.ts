/**
 * SQL data types: the texts a database type is written and reported with, its parameters, its
 * normal form, and how a reported type is recognised from those declarations.
 *
 * A data type declares its facts once. Everything that writes a type name, compares a catalog text
 * or reads a reported type goes through the functions here and contains no type name of its own.
 *
 * ADR 254.
 */

import type {
  CodecLookup,
  DataType,
  DataTypeId,
  DataTypeLookup,
  DataTypeSpec,
} from '@internal/framework-components/codec';
import { dataType, objectSchemaKeys } from '@internal/framework-components/codec';
import { blindCast } from '@internal/utils/casts';
import { ifDefined } from '@internal/utils/defined';
import { InternalError } from '@internal/utils/internal-error';
import { type as arktype, type Type } from 'arktype';
import { contractError } from './contract-errors';

/** One way a database type is written or reported. */
export interface SqlTypeText {
  /** Lower case with single spaces; `{name}` stands for the parameter `name`. */
  readonly text: string;
  /** A migration writes this text. */
  readonly written?: true;
  /** The database catalog prints this text. */
  readonly catalog?: true;
  /** The exact characters written and printed, when they differ from `text` in letter case only. */
  readonly display?: string;
}

export type SqlTypeParams = Readonly<Record<string, unknown>>;

/** What introspection hands over about the element type of one column. */
export interface ReportedSqlType {
  /** The catalog text of the element type. */
  readonly text: string;
  /** The target's word for the type's kind, such as `enum`; undefined for a base type. */
  readonly kind: string | undefined;
  readonly schema: string | undefined;
  /** The type's name, unquoted. */
  readonly name: string | undefined;
}

export interface SqlDataTypeSpec<Params extends SqlTypeParams = SqlTypeParams>
  extends DataTypeSpec {
  readonly params?: Type<Params>;
  readonly texts?: readonly SqlTypeText[];
  /** The kind of reported type this data type claims, instead of any text. */
  readonly claimsKind?: string;
  readonly normalize?: (params: Params) => Params;
  readonly render?: (params: Params) => string;
  readonly fromReported?: (reported: ReportedSqlType) => Params;
}

export interface SqlDataTypeFacts<Params extends SqlTypeParams = SqlTypeParams> {
  readonly texts: readonly SqlTypeText[];
  readonly claimsKind: string | undefined;
  readonly normalize: (params: Params) => Params;
  readonly render: ((params: Params) => string) | undefined;
  readonly fromReported: ((reported: ReportedSqlType) => Params) | undefined;
}

export interface SqlDataType<Params extends SqlTypeParams = SqlTypeParams> extends DataType {
  readonly params?: Type<Params>;
  readonly sql: SqlDataTypeFacts<Params>;
}

export interface ResolvedSqlType {
  readonly dataType: DataTypeId;
  readonly typeParams: SqlTypeParams;
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const LITERAL_CHARACTERS = /^[a-z0-9_ (),.]*$/;
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function paramKeysOf(schema: Type<unknown> | undefined): readonly string[] {
  if (schema === undefined) return [];
  const keys = objectSchemaKeys(schema);
  if (keys === undefined) {
    throw new InternalError(
      'A data type parameter schema must be an arktype object schema; this one exposes no props.',
    );
  }
  return keys;
}

function placeholdersOf(text: string): readonly string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

function placeholderSetOf(text: string): string {
  return [...placeholdersOf(text)].sort().join(',');
}

function patternOf(text: string): RegExp {
  const escaped = text.replace(REGEXP_SPECIAL, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\{[A-Za-z][A-Za-z0-9]*\\\}/g, '(\\d+)')}$`);
}

function refuseDeclaration(id: DataTypeId, why: string): never {
  throw new InternalError(`Data type ${id}: ${why}`);
}

function checkText(id: DataTypeId, text: SqlTypeText, paramKeys: readonly string[]): void {
  const quoted = JSON.stringify(text.text);
  const refuse = (why: string): never => refuseDeclaration(id, `the text ${quoted} ${why}.`);
  if (text.text === '') refuse('is empty');
  if (text.text !== text.text.trim()) refuse('starts or ends with a space');
  if (text.text.includes('  ')) refuse('has two spaces in a row');
  const literal = text.text.replace(PLACEHOLDER, '');
  if (literal.includes('{') || literal.includes('}')) {
    refuse('has a placeholder that is not written {name}');
  }
  if (!LITERAL_CHARACTERS.test(literal)) {
    refuse(
      'must be lower case and contain only letters, digits, spaces, brackets, commas, dots, underscores and placeholders',
    );
  }
  for (const name of placeholdersOf(text.text)) {
    if (!paramKeys.includes(name)) {
      refuse(`names the parameter {${name}}, which the type does not declare`);
    }
  }
  if (text.display === undefined) return;
  const display = JSON.stringify(text.display);
  if (text.display.toLowerCase() !== text.text.toLowerCase()) {
    refuse(`has the display ${display}, which differs from it beyond letter case`);
  }
  if (placeholdersOf(text.display).join(',') !== placeholdersOf(text.text).join(',')) {
    refuse(`has the display ${display}, which writes a placeholder differently`);
  }
}

function checkMarks(id: DataTypeId, texts: readonly SqlTypeText[]): void {
  const marked = new Map<string, { written?: string; catalog?: string }>();
  for (const text of texts) {
    const key = placeholderSetOf(text.text);
    const entry = marked.get(key) ?? {};
    for (const mark of ['written', 'catalog'] as const) {
      if (text[mark] !== true) continue;
      const other = entry[mark];
      if (other !== undefined) {
        refuseDeclaration(
          id,
          `the texts ${JSON.stringify(other)} and ${JSON.stringify(text.text)} have the same placeholders and are both ${mark}.`,
        );
      }
      entry[mark] = text.text;
    }
    marked.set(key, entry);
  }
}

function checkKindClaim<Params extends SqlTypeParams>(
  id: DataTypeId,
  spec: SqlDataTypeSpec<Params>,
): void {
  if (spec.claimsKind === undefined) {
    if (spec.render !== undefined) {
      refuseDeclaration(id, 'render is allowed only together with claimsKind.');
    }
    if (spec.fromReported !== undefined) {
      refuseDeclaration(id, 'fromReported is allowed only together with claimsKind.');
    }
    return;
  }
  if (spec.texts !== undefined) {
    refuseDeclaration(id, 'a type that claims a kind declares no texts.');
  }
}

const identity = <Params>(params: Params): Params => params;

/** Declare a SQL data type, refusing a declaration that breaks a rule of the module. */
export function sqlDataType<Params extends SqlTypeParams = SqlTypeParams>(
  id: string,
  spec: SqlDataTypeSpec<Params>,
): SqlDataType<Params> {
  const declared = dataType(id, spec);
  const texts = spec.texts ?? [];
  const paramKeys = paramKeysOf(spec.params);
  for (const text of texts) checkText(declared.id, text, paramKeys);
  checkMarks(declared.id, texts);
  checkKindClaim(declared.id, spec);
  return {
    id: declared.id,
    ...ifDefined('params', spec.params),
    casts: declared.casts,
    ...ifDefined('listCast', declared.listCast),
    sql: {
      texts,
      claimsKind: spec.claimsKind,
      normalize: spec.normalize ?? identity,
      render: spec.render,
      fromReported: spec.fromReported,
    },
  };
}

export function isSqlDataType(type: DataType): type is SqlDataType {
  return 'sql' in type;
}

/** The parameters of `typeParams` that `type` declares; codec-owned keys are dropped. */
export function dataTypeParams(
  type: DataType,
  typeParams: SqlTypeParams | undefined,
): SqlTypeParams {
  if (typeParams === undefined) return {};
  const kept: Record<string, unknown> = {};
  for (const key of paramKeysOf(type.params)) {
    if (Object.hasOwn(typeParams, key)) kept[key] = typeParams[key];
  }
  return kept;
}

function presentKeys(params: SqlTypeParams): readonly string[] {
  return Object.keys(params).filter((key) => params[key] !== undefined);
}

function formatKeys(keys: readonly string[]): string {
  return `[${[...keys].sort().join(', ')}]`;
}

/** The parameters, when `type` accepts them; otherwise `CONTRACT.TYPE_PARAMS_INVALID` naming each parameter at fault. */
export function validateSqlTypeParams<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
  params: SqlTypeParams,
): Params {
  if (type.params === undefined) {
    return blindCast<
      Params,
      'a type without a parameter schema declares no parameters, so its parameter type is the empty object'
    >(params);
  }
  const result = type.params(params);
  if (result instanceof arktype.errors) {
    throw contractError('CONTRACT.TYPE_PARAMS_INVALID', `${type.id}: ${result.summary}`, {
      meta: {
        dataType: type.id,
        parameters: [...new Set(result.map((error) => error.path.map(String).join('.')))],
      },
    });
  }
  return blindCast<
    Params,
    'the schema accepted params, and an object schema of parameters has no morphs, so the accepted value is the parameters as declared'
  >(params);
}

function pickText<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
  mark: 'written' | 'catalog',
  keys: readonly string[],
): SqlTypeText {
  const candidates = type.sql.texts.filter((text) => text[mark] === true);
  const wanted = [...keys].sort().join(',');
  const found = candidates.find((text) => placeholderSetOf(text.text) === wanted);
  if (found !== undefined) return found;
  const verb = mark === 'written' ? 'written' : 'reported';
  const takes =
    candidates.length === 0
      ? `it is never ${verb}`
      : `it is ${verb} with ${candidates.map((text) => formatKeys(placeholdersOf(text.text))).join(', ')}`;
  throw contractError(
    'CONTRACT.TYPE_PARAMS_INVALID',
    `${type.id} cannot be ${verb} with parameters ${formatKeys(keys)}; ${takes}`,
    { meta: { dataType: type.id, parameters: [...keys] } },
  );
}

function substitute(text: SqlTypeText, params: SqlTypeParams): string {
  return (text.display ?? text.text).replace(PLACEHOLDER, (_, name: string) =>
    String(params[name]),
  );
}

/** The name of `type` with no parameters, for places where parameters must not appear. */
export function sqlBaseName<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
  params: SqlTypeParams,
): string {
  if (type.sql.render !== undefined) return type.sql.render(validateSqlTypeParams(type, params));
  const written = type.sql.texts.filter((text) => text.written === true);
  const fewest = written.reduce<SqlTypeText | undefined>(
    (best, text) =>
      best === undefined || placeholdersOf(text.text).length < placeholdersOf(best.text).length
        ? text
        : best,
    undefined,
  );
  if (fewest === undefined) {
    throw new InternalError(
      `Data type ${type.id} has no written text and no render, so it has no base name.`,
    );
  }
  const name = fewest.display ?? fewest.text;
  if (placeholdersOf(fewest.text).length === 0) return name;
  const bracket = name.indexOf('(');
  return bracket === -1 ? name : name.slice(0, bracket);
}

/**
 * The type name a contract stores for a column or storage type of `type` with `typeParams`: the
 * base name, or for a type that claims a kind, its `typeName` parameter as written.
 */
export function storedSqlTypeName(type: DataType, typeParams: SqlTypeParams | undefined): string {
  if (!isSqlDataType(type)) {
    throw new InternalError(`Data type ${type.id} is not a SQL data type, so it has no type name.`);
  }
  const params = dataTypeParams(type, typeParams);
  if (type.sql.claimsKind === undefined) return sqlBaseName(type, params);
  const { typeName } = validateSqlTypeParams(type, params);
  if (typeof typeName !== 'string') {
    throw new InternalError(
      `Data type ${type.id} claims the kind "${type.sql.claimsKind}" but declares no string typeName parameter.`,
    );
  }
  return typeName;
}

/** The lookups that find the data type a codec represents. */
export interface SqlTypeLookups {
  readonly codecLookup: Pick<CodecLookup, 'descriptorFor'>;
  readonly dataTypeLookup: Pick<DataTypeLookup, 'get'>;
}

/** The SQL data type the codec `codecId` represents. */
export function sqlDataTypeOfCodec(codecId: string, lookups: SqlTypeLookups): SqlDataType {
  const descriptor = lookups.codecLookup.descriptorFor?.(codecId);
  if (descriptor === undefined) {
    throw contractError(
      'CONTRACT.CODEC_DESCRIPTOR_MISSING',
      `No codec "${codecId}" is registered, so its column type cannot be named.`,
      { meta: { codecId } },
    );
  }
  const type = lookups.dataTypeLookup.get(descriptor.dataType);
  if (type === undefined) {
    throw contractError(
      'CONTRACT.DATA_TYPE_UNREGISTERED',
      `Codec "${codecId}" represents data type "${descriptor.dataType}", which no component registers.`,
      { meta: { codecId, dataType: descriptor.dataType } },
    );
  }
  if (!isSqlDataType(type)) {
    throw new InternalError(`Data type ${type.id} is not a SQL data type, so it has no type name.`);
  }
  return type;
}

/** {@link storedSqlTypeName} of the data type the codec `codecId` represents. */
export function storedSqlTypeNameOfCodec(
  codecId: string,
  typeParams: SqlTypeParams | undefined,
  lookups: SqlTypeLookups,
): string {
  return storedSqlTypeName(sqlDataTypeOfCodec(codecId, lookups), typeParams);
}

/** {@link renderSqlTypeName} of the data type the codec `codecId` represents, with the parameters that type declares. */
export function renderSqlColumnTypeName(
  codecId: string,
  typeParams: SqlTypeParams | undefined,
  lookups: SqlTypeLookups,
): string {
  const type = sqlDataTypeOfCodec(codecId, lookups);
  return renderSqlTypeName(type, dataTypeParams(type, typeParams));
}

/** The text a migration writes for `type` with the raw `params`. */
export function renderSqlTypeName<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
  params: SqlTypeParams,
): string {
  const validated = validateSqlTypeParams(type, params);
  if (type.sql.render !== undefined) return type.sql.render(validated);
  const normalized = type.sql.normalize(validated);
  const keys = presentKeys(params).filter((key) => Object.hasOwn(normalized, key));
  return substitute(pickText(type, 'written', keys), params);
}

/** The text the database catalog prints for `type` with `params`, in their normal form. */
export function renderSqlCatalogText<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
  params: SqlTypeParams,
): string {
  const validated = validateSqlTypeParams(type, params);
  if (type.sql.claimsKind !== undefined) {
    throw new InternalError(
      `Data type ${type.id} claims the kind "${type.sql.claimsKind}" and has no catalog text.`,
    );
  }
  const normalized = type.sql.normalize(validated);
  return substitute(pickText(type, 'catalog', presentKeys(normalized)), normalized);
}

function prepareReportedText(text: string): string {
  let prepared = '';
  let quoted = false;
  let spacePending = false;
  for (const character of text.trim()) {
    if (!quoted && /\s/.test(character)) {
      spacePending = true;
      continue;
    }
    if (spacePending && !/[(,]$/.test(prepared) && character !== ')') prepared += ' ';
    spacePending = false;
    if (character === '"') quoted = !quoted;
    prepared += quoted ? character : character.toLowerCase();
  }
  return prepared;
}

function claims(text: SqlTypeText): boolean {
  return text.catalog === true || text.written !== true;
}

/** The texts by which `type` recognises a reported type: those marked catalog, and those with neither mark. */
export function claimingSqlTexts<Params extends SqlTypeParams>(
  type: SqlDataType<Params>,
): readonly string[] {
  return type.sql.texts.filter(claims).map((text) => text.text);
}

/** Two claiming texts collide when either one's pattern matches the other with each placeholder written as 1. */
export function sqlTypeTextsCollide(a: string, b: string): boolean {
  const withOnes = (text: string) => text.replace(PLACEHOLDER, '1');
  return patternOf(a).test(withOnes(b)) || patternOf(b).test(withOnes(a));
}

/**
 * The data type that claims a reported type, with its parameters in normal form, or undefined when
 * no type in `dataTypes` claims it or its parameters fail the type's schema.
 */
export function resolveReportedSqlType(
  reported: ReportedSqlType,
  dataTypes: readonly DataType[],
): ResolvedSqlType | undefined {
  const sqlTypes = dataTypes.filter(isSqlDataType);
  if (reported.kind !== undefined) {
    const claimant = sqlTypes.find((type) => type.sql.claimsKind === reported.kind);
    if (claimant === undefined) return undefined;
    return resolvedWith(claimant, claimant.sql.fromReported?.(reported) ?? {});
  }
  const text = prepareReportedText(reported.text);
  for (const type of sqlTypes) {
    for (const candidate of type.sql.texts) {
      if (!claims(candidate)) continue;
      const match = patternOf(candidate.text).exec(text);
      if (match === null) continue;
      const params = Object.fromEntries(
        placeholdersOf(candidate.text).map((name, index) => [
          name,
          Number.parseInt(match[index + 1] ?? '', 10),
        ]),
      );
      return resolvedWith(type, params);
    }
  }
  return undefined;
}

function resolvedWith(type: SqlDataType, params: SqlTypeParams): ResolvedSqlType | undefined {
  if (type.params !== undefined && type.params(params) instanceof arktype.errors) return undefined;
  return { dataType: type.id, typeParams: type.sql.normalize(params) };
}
