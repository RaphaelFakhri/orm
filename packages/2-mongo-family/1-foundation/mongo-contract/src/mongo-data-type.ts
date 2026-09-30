/**
 * Mongo data types: a data type with the BSON types a value of it is stored as. A type stored as
 * more than one BSON type lists each, and a type that accepts any BSON value lists none.
 *
 * ADR 254.
 */

import type { DataType, DataTypeSpec } from '@internal/framework-components/codec';
import { dataType } from '@internal/framework-components/codec';

export interface MongoDataTypeSpec extends Pick<DataTypeSpec, 'params' | 'casts'> {
  readonly bsonTypes: readonly string[];
}

export interface MongoDataType extends DataType {
  readonly bsonTypes: readonly string[];
}

export function mongoDataType(id: string, spec: MongoDataTypeSpec): MongoDataType {
  return { ...dataType(id, spec), bsonTypes: [...spec.bsonTypes] };
}

export function isMongoDataType(type: DataType): type is MongoDataType {
  return 'bsonTypes' in type;
}
