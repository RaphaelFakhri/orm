/**
 * Codec and data type lookups for SQL unit tests that build contracts without a real stack.
 *
 * Every codec id represents a SQL data type written as the type name the tests expect: the name in
 * `CODEC_TYPE_NAMES` or `names`, else the codec id's middle part. A data type id that no codec here
 * produced (a test's own codec descriptors name it) is written as the name in `DATA_TYPE_NAMES`, else
 * its name part. Each codec stores its values as authored and takes any parameters.
 */

import type { JsonValue } from '@internal/contract/types';
import type {
  AnyCodecDescriptor,
  Codec,
  CodecLookup,
  DataType,
  DataTypeLookup,
} from '@internal/framework-components/codec';
import { blindCast } from '@internal/utils/casts';
import { type } from 'arktype';
import { sqlDataType } from '../src/sql-data-type';

const CODEC_TYPE_NAMES: Readonly<Record<string, string>> = {
  'pg/timestamptz-temporal@1': 'timestamptz',
  'pg/timestamptz-date@1': 'timestamptz',
  'pg/timestamptz-string@1': 'timestamptz',
  'pg/timestamp-temporal@1': 'timestamp',
  'pg/timestamp-string@1': 'timestamp',
  'pg/date-temporal@1': 'date',
  'pg/date-string@1': 'date',
  'pg/time-temporal@1': 'time',
  'pg/time-string@1': 'time',
  'pg/int8number@1': 'int8',
  'pg/unboundedint@1': 'numeric',
  'sql/char@1': 'character',
  'sql/varchar@1': 'character varying',
  'sql/int@1': 'int4',
  'sql/float@1': 'float8',
  'sqlite/bigintnumber@1': 'integer',
  'sqlite/bigint@1': 'integer',
  'sqlite/datetime@1': 'text',
  'sqlite/json@1': 'text',
};

const DATA_TYPE_NAMES: Readonly<Record<string, string>> = {
  'pg/char': 'character',
  'pg/varchar': 'character varying',
  'pg/varbit': 'bit varying',
  'pgvector/vector': 'vector',
  'postgis/geometry': 'geometry',
  'sqlite/character': 'character',
  'sqlite/character-varying': 'character varying',
};

const ENUM_CODEC_IDS: ReadonlySet<string> = new Set(['pg/enum@1']);
const ENUM_DATA_TYPE_IDS: ReadonlySet<string> = new Set(['pg/enum']);

function middlePart(codecId: string): string {
  return codecId.match(/^[^/]+\/([^@]+)@/)?.[1] ?? codecId;
}

function writtenName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_ (),.]/g, '_');
}

function testDataType(id: string, name: string | undefined): DataType {
  if (name === undefined) {
    return sqlDataType(id, {
      params: type({ typeName: 'string > 0' }),
      claimsKind: 'enum',
      render: ({ typeName }) => typeName,
    });
  }
  return sqlDataType(id, { texts: [{ text: writtenName(name), written: true }] });
}

const acceptAnything: AnyCodecDescriptor['paramsSchema'] = {
  '~standard': {
    version: 1,
    vendor: 'sql-contract-test',
    validate: (value: unknown) => ({ value }),
  },
};

function storesAsAuthored(codecId: string): Codec {
  return blindCast<Codec, 'a test codec needs only the conversions a contract build calls'>({
    id: codecId,
    encode: async (value: unknown) => value,
    decode: async (wire: unknown) => wire,
    encodeJson: (value: unknown) =>
      blindCast<JsonValue, 'a test codec stores what it is given'>(value),
    decodeJson: (json: JsonValue) => json,
  });
}

export interface TestSqlTypeLookups {
  readonly codecLookup: CodecLookup;
  readonly dataTypeLookup: DataTypeLookup;
}

/** Test lookups; `names` maps a codec id to the type name its data type is written as. */
export function testSqlTypeLookups(
  names: Readonly<Record<string, string>> = {},
  codecLookup?: CodecLookup,
): TestSqlTypeLookups {
  const dataTypes = new Map<string, DataType>();
  const dataTypeFor = (id: string, name: string | undefined): DataType => {
    const existing = dataTypes.get(id);
    if (existing !== undefined) return existing;
    const created = testDataType(id, name);
    dataTypes.set(id, created);
    return created;
  };
  const dataTypeIdOf = (codecId: string) =>
    `test-codec/${codecId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

  const descriptorFor = (codecId: string): AnyCodecDescriptor => {
    const name = ENUM_CODEC_IDS.has(codecId)
      ? undefined
      : (names[codecId] ?? CODEC_TYPE_NAMES[codecId] ?? middlePart(codecId));
    return {
      codecId,
      dataType: dataTypeFor(dataTypeIdOf(codecId), name).id,
      traits: [],
      targetTypes: [],
      paramsSchema: acceptAnything,
      isParameterized: true,
      factory: () => () => storesAsAuthored(codecId),
    };
  };

  const lenientCodecLookup: CodecLookup = {
    get: (codecId) => storesAsAuthored(codecId),
    descriptorFor,
    targetTypesFor: () => undefined,
    renderOutputTypeFor: () => undefined,
  };

  return {
    codecLookup: codecLookup ?? lenientCodecLookup,
    dataTypeLookup: {
      get: (id) =>
        dataTypeFor(
          id,
          ENUM_DATA_TYPE_IDS.has(id) ? undefined : (DATA_TYPE_NAMES[id] ?? id.split('/')[1] ?? id),
        ),
      has: () => true,
      all: () => [...dataTypes.values()],
    },
  };
}

/** Lookups for tests that do not care which type names their columns are written with. */
export const testTypeLookups: TestSqlTypeLookups = testSqlTypeLookups();
