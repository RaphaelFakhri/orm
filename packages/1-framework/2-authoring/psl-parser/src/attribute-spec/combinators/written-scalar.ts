import type { WrittenScalar } from '@internal/framework-components/authoring';
import type { PslSpan } from '@internal/framework-components/psl-ast';
import { blindCast } from '@internal/utils/casts';
import { InternalError } from '@internal/utils/internal-error';
import { ok } from '@internal/utils/result';
import { nodePslSpan } from '../../resolve';
import { readWrittenScalar } from '../../written-scalar';
import type { ArgType, AttributeCtx } from '../types';
import { list } from './list';

/** A literal argument read as a written scalar, with its span; a tagged literal whose text cannot be canonicalized carries why. */
export type ParsedWrittenScalar =
  | { readonly ok: true; readonly written: WrittenScalar; readonly span: PslSpan }
  | { readonly ok: false; readonly reason: 'nul' | 'too-large'; readonly span: PslSpan };

/**
 * `arm`, yielding the literal it accepts as a written scalar with its span, so a consumer that reads
 * the value by the cast rule reports at the value. `arm` must accept only literals. ADR 254.
 */
export function writtenScalar<Ctx extends AttributeCtx>(
  arm: ArgType<unknown, Ctx>,
): ArgType<ParsedWrittenScalar, Ctx> {
  const parse: ArgType<ParsedWrittenScalar, Ctx>['parse'] = (arg, ctx) => {
    const accepted = arm.parse(arg, ctx);
    if (!accepted.ok) return accepted;
    const span = nodePslSpan(arg.syntax, ctx.sources);
    const literal = readWrittenScalar(arg);
    if (literal.ok) return ok({ ok: true, written: literal.written, span });
    if (literal.reason === 'not-a-literal') {
      throw new InternalError(`writtenScalar wraps an arm that accepted ${literal.found}.`);
    }
    return ok({ ok: false, reason: literal.reason, span });
  };
  return blindCast<
    ArgType<ParsedWrittenScalar, Ctx>,
    "The arm's metadata does not depend on its output type, but TypeScript cannot carry a spread of the ArgType union over to a new output type."
  >({ ...arm, parse });
}

/** A written list with its span, so a refusal about the whole list is reported at it. */
export interface ParsedWrittenList {
  readonly elements: readonly ParsedWrittenScalar[];
  readonly span: PslSpan;
}

/** A list of written scalars, yielding its elements and the span of the whole list. ADR 254. */
export function writtenList(
  of: ArgType<ParsedWrittenScalar, AttributeCtx>,
): ArgType<ParsedWrittenList, AttributeCtx> {
  const arm = list(of, { label: `list of (${of.label})` });
  return {
    kind: 'list',
    label: arm.label,
    of: arm.of,
    allowEmpty: arm.allowEmpty,
    unique: arm.unique,
    parse: (arg, ctx) => {
      const parsed = arm.parse(arg, ctx);
      return parsed.ok
        ? ok({ elements: parsed.value, span: nodePslSpan(arg.syntax, ctx.sources) })
        : parsed;
    },
  };
}
