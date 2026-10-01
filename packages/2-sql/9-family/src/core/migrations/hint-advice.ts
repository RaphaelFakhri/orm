import type { ConsumedHint } from '@internal/framework-components/control';
import { assertDefined } from '@internal/utils/assertions';

/** The line `migration plan` prints under `Hints applied` for a hint the plan acted on. */
export function describeConsumedHint(hint: ConsumedHint): string {
  const table = hint.coordinate.entityName;
  const column = hint.memberName;
  if (hint.kind === 'deleted') {
    return column === undefined
      ? `deleted hint on table "${table}": dropped and recorded; you can remove the model.`
      : `deleted hint on column "${table}"."${column}": dropped and recorded; you can remove the field.`;
  }
  const from = hint.from;
  assertDefined(from, `a consumed rename hint on "${table}" carries the old name`);
  return column === undefined
    ? `rename hint on table "${table}" (was "${from}"): renamed and recorded in this migration; you can remove the hint.`
    : `rename hint on column "${table}"."${column}" (was "${from}"): renamed and recorded; you can remove the hint.`;
}
