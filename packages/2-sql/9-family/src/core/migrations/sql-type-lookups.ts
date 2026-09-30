import type { CodecLookup, DataTypeLookup } from '@internal/framework-components/codec';
import type { TargetBoundComponentDescriptor } from '@internal/framework-components/components';
import { assembleDataTypes, extractCodecLookup } from '@internal/framework-components/control';

/** The codecs and data types a set of composed components registers. */
export interface SqlComponentTypes {
  readonly codecLookup: CodecLookup;
  readonly dataTypeLookup: DataTypeLookup;
}

export function sqlComponentTypes(
  frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<'sql', string>>,
): SqlComponentTypes {
  return {
    codecLookup: extractCodecLookup(frameworkComponents),
    dataTypeLookup: assembleDataTypes(frameworkComponents).lookup,
  };
}
