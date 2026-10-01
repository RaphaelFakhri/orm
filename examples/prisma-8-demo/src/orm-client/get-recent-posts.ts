import type { Runtime } from '@prisma/orm-postgres/family-runtime';
import { type SortDirection, sortField } from '@prisma/orm-postgres/orm-client';
import { createOrmClient } from './client';
import { createdSince, postSummary } from './fragments';

/**
 * Posts created since a point in time, sorted by a field named in the request. `sortField` throws
 * `ORM.ARGUMENT_INVALID` for a name other than `title` or `createdAt` before the query runs.
 */
export async function ormClientGetRecentPosts(
  since: Temporal.Instant,
  sort: string,
  direction: SortDirection,
  limit: number,
  runtime: Runtime,
) {
  const db = createOrmClient(runtime);
  return db.Post.where(createdSince(since))
    .orderBy(sortField(db.Post, sort, direction, ['title', 'createdAt']))
    .pipe(postSummary)
    .limit(limit)
    .all();
}
