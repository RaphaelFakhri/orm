import { dataType } from '@internal/framework-components/codec';
import { sqlDataType } from '@internal/sql-contract/data-type';
import { blindCast } from '@internal/utils/casts';
import { InternalError } from '@internal/utils/internal-error';
import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { enforceSqlDataTypeInvariants } from '../src/core/assembly';
import { createSqlFamilyInstance } from '../src/core/control-instance';

const int4 = sqlDataType('pg/int4', {
  texts: [{ text: 'int4', written: true }, { text: 'integer', catalog: true }, { text: 'int' }],
});
const numeric = sqlDataType('pg/numeric', {
  params: type({ 'precision?': 'number.integer >= 1' }),
  texts: [
    { text: 'numeric', written: true, catalog: true },
    { text: 'numeric({precision})', written: true, catalog: true },
  ],
});
const enumType = sqlDataType('pg/enum', {
  params: type({ typeName: 'string > 0' }),
  claimsKind: 'enum',
  render: ({ typeName }) => `"${typeName}"`,
});

const stackWith = (extensionTypes: readonly ReturnType<typeof dataType>[]) => ({
  family: { id: 'sql' },
  target: { id: 'postgres', dataTypes: [int4, numeric, enumType] },
  adapter: { id: 'postgres-adapter' },
  extensions: [{ id: 'ext', dataTypes: extensionTypes }],
});

describe('enforceSqlDataTypeInvariants', () => {
  it('passes data types whose claiming texts are distinct', () => {
    const other = sqlDataType('ext/int', {
      texts: [{ text: 'int16', written: true, catalog: true }],
    });
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).not.toThrow();
  });

  it('refuses two data types whose claiming texts are equal, naming both contributors and ids', () => {
    const other = sqlDataType('ext/integer', { texts: [{ text: 'integer', catalog: true }] });
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).toThrow(InternalError);
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).toThrow(
      /pg\/int4.*postgres.*ext\/integer.*ext|ext\/integer.*ext.*pg\/int4.*postgres/s,
    );
  });

  it('refuses a claiming text whose pattern matches another type’s text with its placeholders as 1', () => {
    const other = sqlDataType('ext/numeric-one', { texts: [{ text: 'numeric(1)' }] });
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).toThrow(
      /pg\/numeric.*ext\/numeric-one|ext\/numeric-one.*pg\/numeric/s,
    );
  });

  it('ignores texts that are only written', () => {
    const other = sqlDataType('ext/int4', { texts: [{ text: 'int4', written: true }] });
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).not.toThrow();
  });

  it('refuses two data types claiming one kind, naming both contributors and ids', () => {
    const other = sqlDataType('ext/enum', {
      params: type({ typeName: 'string > 0' }),
      claimsKind: 'enum',
      render: ({ typeName }) => typeName,
    });
    expect(() => enforceSqlDataTypeInvariants(stackWith([other]))).toThrow(
      /pg\/enum.*postgres.*ext\/enum.*ext|ext\/enum.*ext.*pg\/enum.*postgres/s,
    );
  });

  it('ignores data types that are not SQL data types', () => {
    expect(() =>
      enforceSqlDataTypeInvariants(stackWith([dataType('ext/plain', {})])),
    ).not.toThrow();
  });
});

describe('createSqlFamilyInstance', () => {
  it('refuses a stack whose SQL data types collide, before building anything', () => {
    const other = sqlDataType('ext/integer', { texts: [{ text: 'integer', catalog: true }] });
    const stack = { ...stackWith([other]), codecTypeImports: [], extensionIds: [] };
    expect(() =>
      createSqlFamilyInstance(
        blindCast<
          Parameters<typeof createSqlFamilyInstance>[0],
          'only the data type slots are read'
        >(stack),
      ),
    ).toThrow(/pg\/int4.*ext\/integer|ext\/integer.*pg\/int4/s);
  });
});
