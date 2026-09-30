import type { JsonValue } from '@internal/contract/types';
import type {
  AuthoringDiagnosticSink,
  AuthoringEntityContext,
  ParsedPslExtensionBlock,
} from '@internal/framework-components/authoring';
import type {
  AnyCodecDescriptor,
  Codec,
  CodecLookup,
  DataType,
} from '@internal/framework-components/codec';
import { createDataTypeLookup } from '@internal/framework-components/codec';
import { sqlDataType } from '@internal/sql-contract/data-type';
import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { sqlFamilyEnumEntityDescriptor } from '../src/core/authoring-entity-types';

const SPAN = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

function enumBlock(input: {
  readonly name: string;
  readonly values: Record<string, JsonValue | undefined>;
  readonly typeCodecId?: string;
}): ParsedPslExtensionBlock<Record<string, JsonValue | undefined>> {
  return {
    kind: 'enum',
    keyword: 'enum',
    name: input.name,
    values: input.values,
    parameterSpans: Object.fromEntries(Object.keys(input.values).map((key) => [key, SPAN])),
    attributes:
      input.typeCodecId !== undefined
        ? { type: { args: { codecId: input.typeCodecId }, span: SPAN } }
        : {},
    span: SPAN,
  };
}

const TEXT_CODEC_ID = 'pg/text@1';
const INT_CODEC_ID = 'pg/int@1';
const JSON_CODEC_ID = 'test/json@1';
const FOLDING_CODEC_ID = 'test/folding-text@1';

const textCodec: Codec = {
  id: TEXT_CODEC_ID,
  encode: async (v: unknown) => v,
  decode: async (w: unknown) => w,
  encodeJson: (value) => value as never,
  decodeJson(json) {
    if (typeof json !== 'string') throw new Error(`expected string, got ${typeof json}`);
    return json;
  },
};

const intCodec: Codec = {
  id: INT_CODEC_ID,
  encode: async (v: unknown) => v,
  decode: async (w: unknown) => w,
  encodeJson: (value) => value as never,
  decodeJson(json) {
    if (typeof json !== 'number') throw new Error(`expected number, got ${typeof json}`);
    return json;
  },
};

const jsonCodec: Codec = {
  id: JSON_CODEC_ID,
  encode: async (v: unknown) => v,
  decode: async (w: unknown) => w,
  encodeJson: (value) => value as never,
  decodeJson(json) {
    if (json === null) throw new Error('expected a non-null JSON value');
    return json;
  },
};

const foldingCodec: Codec = {
  id: FOLDING_CODEC_ID,
  encode: async (v: unknown) => v,
  decode: async (w: unknown) => w,
  encodeJson: (value) => value as never,
  decodeJson(json) {
    if (typeof json !== 'string') throw new Error(`expected string, got ${typeof json}`);
    return json.toLowerCase();
  },
};

const VECTOR_CODEC_ID = 'test/vector@1';
const vectorCodec: Codec = { ...textCodec, id: VECTOR_CODEC_ID };

const ORPHAN_CODEC_ID = 'test/orphan@1';
const orphanCodec: Codec = { ...textCodec, id: ORPHAN_CODEC_ID };

const textType = sqlDataType('test/text', { texts: [{ text: 'text', written: true }] });
const intType = sqlDataType('test/int', { texts: [{ text: 'int', written: true }] });
const jsonType = sqlDataType('test/json', { texts: [{ text: 'json', written: true }] });
const vectorType = sqlDataType('test/vector', {
  params: type({ length: 'number.integer >= 1' }),
  texts: [{ text: 'vector({length})', written: true }],
});

const dataTypeOfCodec: Readonly<Record<string, DataType>> = {
  [TEXT_CODEC_ID]: textType,
  [INT_CODEC_ID]: intType,
  [JSON_CODEC_ID]: jsonType,
  [FOLDING_CODEC_ID]: textType,
  [VECTOR_CODEC_ID]: vectorType,
};

const testCodecLookup: CodecLookup = {
  get(id: string): Codec | undefined {
    if (id === TEXT_CODEC_ID) return textCodec;
    if (id === INT_CODEC_ID) return intCodec;
    if (id === JSON_CODEC_ID) return jsonCodec;
    if (id === FOLDING_CODEC_ID) return foldingCodec;
    if (id === VECTOR_CODEC_ID) return vectorCodec;
    if (id === ORPHAN_CODEC_ID) return orphanCodec;
    return undefined;
  },
  descriptorFor(id: string): AnyCodecDescriptor | undefined {
    if (id === ORPHAN_CODEC_ID) {
      return { codecId: id, dataType: 'test/unregistered' } as AnyCodecDescriptor;
    }
    const dataType = dataTypeOfCodec[id];
    return dataType === undefined
      ? undefined
      : ({ codecId: id, dataType: dataType.id } as AnyCodecDescriptor);
  },
  renderOutputTypeFor: () => undefined,
};

const testDataTypes = createDataTypeLookup([textType, intType, jsonType, vectorType]);

function makeContext(diagnostics: unknown[], withDataTypes = true): AuthoringEntityContext {
  const sink: AuthoringDiagnosticSink = {
    push: (d) => diagnostics.push(d),
  };
  return {
    family: 'sql',
    target: 'postgres',
    codecLookup: testCodecLookup,
    ...(withDataTypes ? { dataTypes: testDataTypes } : {}),
    sourceId: 'schema.prisma',
    diagnostics: sink,
    enumInferenceCodecs: { text: TEXT_CODEC_ID, int: INT_CODEC_ID },
  };
}

const factory = sqlFamilyEnumEntityDescriptor.output.factory;

describe('sqlFamilyEnumEntityDescriptor: @@type omitted, inferred from members', () => {
  it('bare members infer the text codec and decode from their key', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: undefined, user: undefined } }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({
      codecId: TEXT_CODEC_ID,
      members: { admin: 'admin', user: 'user' },
    });
  });

  it('string members infer the text codec', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: 'admin', user: 'user' } }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({
      codecId: TEXT_CODEC_ID,
      members: { admin: 'admin', user: 'user' },
    });
  });

  it('a mix of bare and string members still infers the text codec', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: undefined, user: 'user' } }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({ codecId: TEXT_CODEC_ID });
  });

  it('integer members infer the int codec', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Priority', values: { low: 1, high: 2 } }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({
      codecId: INT_CODEC_ID,
      members: { low: 1, high: 2 },
    });
  });

  it('a float member cannot be inferred', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Priority', values: { low: 1.5 } }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_CANNOT_INFER_TYPE' })]);
  });

  it('a boolean member cannot be inferred', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Flag', values: { on: true } }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_CANNOT_INFER_TYPE' })]);
  });

  it('an explicit null member cannot be inferred and is not a bare member', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Odd', values: { none: null } }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_CANNOT_INFER_TYPE' })]);
  });

  it('a mix of string and integer members cannot be inferred', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Mixed', values: { low: 'low', high: 2 } }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_CANNOT_INFER_TYPE' })]);
  });

  it('the diagnostic names the enum and suggests an explicit @@type', () => {
    const diagnostics: { code: string; message: string }[] = [];
    factory(enumBlock({ name: 'Priority', values: { low: 1.5 } }), makeContext(diagnostics));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PSL_ENUM_CANNOT_INFER_TYPE',
        message: expect.stringMatching(/Priority/),
      }),
    ]);
    expect(diagnostics[0]?.message).toMatch(/@@type/);
  });

  it('an empty enum cannot be inferred', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(enumBlock({ name: 'Empty', values: {} }), makeContext(diagnostics));

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_CANNOT_INFER_TYPE' })]);
  });
});

describe('sqlFamilyEnumEntityDescriptor: explicit @@type bypasses inference, never validation', () => {
  it('an explicit @@type is used verbatim, skipping inference entirely', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Priority', values: { low: 1.5 }, typeCodecId: TEXT_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_EXTENSION_INVALID_VALUE' })]);
    expect(handle).toBeUndefined();
  });

  it('an explicit @@type resolving to text lowers exactly as before', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: 'admin' }, typeCodecId: TEXT_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({ codecId: TEXT_CODEC_ID });
  });

  it('an explicit codec receives structured JSON media through the shared grammar', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({
        name: 'Config',
        values: { region: { zone: 'a', replicas: [1, 2] }, tags: ['x', 'y'] },
        typeCodecId: JSON_CODEC_ID,
      }),
      makeContext(diagnostics),
    );

    expect(diagnostics).toEqual([]);
    expect(handle).toMatchObject({
      codecId: JSON_CODEC_ID,
      members: { region: { zone: 'a', replicas: [1, 2] }, tags: ['x', 'y'] },
    });
  });

  it('an explicit null member reaches the codec and its rejection is reported', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Odd', values: { none: null }, typeCodecId: JSON_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PSL_EXTENSION_INVALID_VALUE',
        message: expect.stringContaining('rejected by codec'),
      }),
    ]);
  });

  it('a bare member under a non-string codec is its own diagnostic', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Priority', values: { low: undefined }, typeCodecId: INT_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'PSL_ENUM_BARE_MEMBER_NON_STRING_CODEC' }),
    ]);
  });

  it('refuses a codec whose data type requires a parameter, naming it', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Axis', values: { x: 'x' }, typeCodecId: VECTOR_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      {
        code: 'PSL_ENUM_TYPE_NEEDS_PARAMETERS',
        message:
          'enum "Axis" @@type codec "test/vector@1" represents data type "test/vector", which requires the parameter "length"; an enum block gives it none',
        sourceId: 'schema.prisma',
        span: SPAN,
      },
    ]);
  });

  it('builds no enum when the context has no data types', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: 'admin' } }),
      makeContext(diagnostics, false),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PSL_EXTENSION_INVALID_VALUE',
        message: expect.stringContaining('which no component registers'),
      }),
    ]);
  });

  it('reports a known codec whose data type no component registers', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: 'admin' }, typeCodecId: ORPHAN_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      {
        code: 'PSL_EXTENSION_INVALID_VALUE',
        message:
          'enum "Role" @@type codec "test/orphan@1" represents data type "test/unregistered", which no component registers',
        sourceId: 'schema.prisma',
        span: SPAN,
      },
    ]);
  });

  it('an unknown codec id is reported', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Role', values: { admin: 'admin' }, typeCodecId: 'nope/missing@1' }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PSL_EXTENSION_INVALID_VALUE',
        message: expect.stringContaining('unknown codec'),
      }),
    ]);
  });

  it('collides on DECODED values, not raw literals', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({
        name: 'Folded',
        values: { first: 'Admin', second: 'admin' },
        typeCodecId: FOLDING_CODEC_ID,
      }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'PSL_ENUM_DUPLICATE_MEMBER_VALUE',
        message: expect.stringContaining('"admin"'),
      }),
    ]);
  });

  it('an explicit-codec empty enum is reported as missing members', () => {
    const diagnostics: unknown[] = [];
    const handle = factory(
      enumBlock({ name: 'Empty', values: {}, typeCodecId: TEXT_CODEC_ID }),
      makeContext(diagnostics),
    );

    expect(handle).toBeUndefined();
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PSL_ENUM_MISSING_TYPE' })]);
  });
});
