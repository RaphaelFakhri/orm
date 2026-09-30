import type { WrittenScalar } from '@internal/framework-components/authoring';
import type { PslSpan } from '@internal/framework-components/psl-ast';
import { blindCast } from '@internal/utils/casts';
import { InternalError } from '@internal/utils/internal-error';
import { ok } from '@internal/utils/result';
import { nodePslSpan } from '../../resolve';
import { readWrittenScalar } from '../../written-scalar';
import type { ArgType, AttributeCtx } from '../types';
import { list } from './list';

/** A literal argument read as a written scalar, with its span. A tagged literal whose text cannot be canonicalized has no `written` value and carries why. */
export type ParsedWrittenScalar =
  | { readonly kind: 'scalar'; readonly written: WrittenScalar; readonly span: PslSpan }
  | {
      readonly kind: 'scalar';
      readonly written: undefined;
      readonly reason: 'nul' | 'too-large';
      readonly span: PslSpan;
    };

/**
 * `arm`, yielding the literal it accepts as a written scalar with its span, so a consumer that reads
 * the value by the cast rule reports at the value. `arm` must accept only literals. The result keeps
 * the arm's `kind` and metadata, which describe the syntax it accepts for tooling, not its output.
 * ADR 231, ADR 254.
 */
export function writtenScalar<Ctx extends AttributeCtx>(
  arm: ArgType<unknown, Ctx>,
): ArgType<ParsedWrittenScalar, Ctx> {
  const parse: ArgType<ParsedWrittenScalar, Ctx>['parse'] = (arg, ctx) => {
    const accepted = arm.parse(arg, ctx);
    if (!accepted.ok) return accepted;
    const span = nodePslSpan(arg.syntax, ctx.sources);
    const literal = readWrittenScalar(arg);
    if (literal.ok) return ok({ kind: 'scalar', written: literal.written, span });
    if (literal.reason === 'not-a-literal') {
      throw new InternalError(`writtenScalar wraps an arm that accepted ${literal.found}.`);
    }
    return ok({ kind: 'scalar', written: undefined, reason: literal.reason, span });
  };
  return blindCast<
    ArgType<ParsedWrittenScalar, Ctx>,
    "The arm's metadata does not depend on its output type, but TypeScript cannot carry a spread of the ArgType union over to a new output type."
  >({ ...arm, parse });
}

/** A written list with its span, so a refusal about the whole list is reported at it. */
export interface ParsedWrittenList {
  readonly kind: 'list';
  readonly elements: readonly ParsedWrittenScalar[];
  readonly span: PslSpan;
}

/** A list of written scalars, yielding its elements and the span of the whole list. ADR 254. */
export function writtenList<Ctx extends AttributeCtx>(
  of: ArgType<ParsedWrittenScalar, Ctx>,
): ArgType<ParsedWrittenList, Ctx> {
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
        ? ok({
            kind: 'list',
            elements: parsed.value,
            span: nodePslSpan(arg.syntax, ctx.sources),
          })
        : parsed;
    },
  };
}
