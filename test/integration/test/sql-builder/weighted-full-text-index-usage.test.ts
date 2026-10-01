/**
 * Does Postgres use the GIN index a weighted `fullTextIndex` declares, for the
 * SQL the builder lowers from `fns.fullTextMatches` over the same weight
 * groups? The index is created from the DDL the migration planner renders for
 * the fixture contract, and `EXPLAIN (FORMAT JSON)` on the real lowered SQL
 * has to name it. Negative controls change the grouping, the order and the
 * language, and must not use it.
 *
 * `enable_seqscan = off` makes this a question of whether the index is usable
 * at all rather than one about cost estimates on a small table.
 */
import { websearchToTsquery } from '@internal/target-postgres/full-text';
import { beforeAll, describe, expect, it } from 'vitest';
import { type PlannedIndex, plannedExpressionIndexes } from './full-text-index-ddl';
import { setupIntegrationTest, timeouts } from './setup';

const QUERY = 'zebra';

/** Every `Index Name` anywhere in an EXPLAIN plan tree. */
function indexNames(node: unknown): readonly string[] {
  if (Array.isArray(node)) return node.flatMap(indexNames);
  if (node === null || typeof node !== 'object') return [];
  const record: Record<string, unknown> = { ...node };
  const own = typeof record['Index Name'] === 'string' ? [record['Index Name']] : [];
  return [...own, ...Object.values(record).flatMap(indexNames)];
}

describe('weighted full-text index usage', { timeout: timeouts.databaseOperation }, () => {
  const { db, runtime, client, contract, lower } = setupIntegrationTest();

  let searchIndex: PlannedIndex;

  async function explain(sql: string, params: readonly unknown[]) {
    const result = await client().query(`EXPLAIN (FORMAT JSON) ${sql}`, [...params]);
    return result.rows[0]['QUERY PLAN'];
  }

  beforeAll(async () => {
    const [index] = await plannedExpressionIndexes(contract(), 'documents');
    if (index === undefined) throw new Error('the documents table declares no index');
    searchIndex = index;
    await client().query(searchIndex.createSql);

    await client().query(`
      INSERT INTO documents (id, title, subtitle, body)
      SELECT n,
             CASE WHEN n % 97 = 0 THEN 'zebra crossing' ELSE 'ordinary title ' || n END,
             CASE WHEN n % 2 = 0 THEN 'subtitle ' || n ELSE NULL END,
             CASE WHEN n % 89 = 0 THEN 'a zebra grazes here' WHEN n % 3 = 0 THEN NULL ELSE 'filler body ' || n END
      FROM generate_series(1, 600) AS n
    `);
    await client().query('ANALYZE documents');
    await client().query('SET enable_seqscan = off');
  }, timeouts.spinUpPpgDev);

  const matchesQuery = () =>
    db()
      .public.documents.select('id')
      .where((f, fns) =>
        fns.fullTextMatches([[f.title, f.subtitle], [f.body]], fns.websearchToTsquery(QUERY)),
      )
      .build();

  it('renders the same search document in the DDL, the schema node and the query', () => {
    const document = `(setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("subtitle", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B'))`;

    expect(searchIndex.expression).toBe(document);
    expect(searchIndex.createSql).toBe(
      `CREATE INDEX "${searchIndex.name}" ON "public"."documents" USING "gin" (${document})`,
    );
    expect(lower(matchesQuery()).sql).toContain(
      `${document} @@ websearch_to_tsquery('english', $1)`,
    );
  });

  it('uses the index for fullTextMatches over the same weight groups', async () => {
    const lowered = lower(matchesQuery());

    const plan = await explain(lowered.sql, lowered.params);
    expect(indexNames(plan)).toContain(searchIndex.name);
  });

  it('finds the rows that match in any of the columns', async () => {
    const rows = await runtime().query(matchesQuery());

    expect(rows.map((row) => row.id).sort((a, b) => a - b)).toEqual([
      89, 97, 178, 194, 267, 291, 356, 388, 445, 485, 534, 582,
    ]);
  });

  it('uses the index when the predicate is ordered by rank and limited', async () => {
    const lowered = lower(
      db()
        .public.documents.select('id')
        .where((f, fns) =>
          fns.fullTextMatches([[f.title, f.subtitle], [f.body]], fns.websearchToTsquery(QUERY)),
        )
        .orderBy(
          (f, fns) =>
            fns.fullTextRank([[f.title, f.subtitle], [f.body]], fns.websearchToTsquery(QUERY)),
          { direction: 'desc' },
        )
        .limit(5)
        .build(),
    );

    const plan = await explain(lowered.sql, lowered.params);
    expect(indexNames(plan)).toContain(searchIndex.name);
  });

  it('ranks a title match above a body match', async () => {
    const ranked = await runtime().query(
      db()
        .public.documents.select('id')
        .select('rank', (f, fns) =>
          fns.fullTextRank([[f.title, f.subtitle], [f.body]], websearchToTsquery(QUERY)),
        )
        .where((f, fns) => fns.or(fns.eq(f.id, 89), fns.eq(f.id, 97)))
        .orderBy(
          (f, fns) =>
            fns.fullTextRank([[f.title, f.subtitle], [f.body]], websearchToTsquery(QUERY)),
          { direction: 'desc' },
        )
        .build(),
    );

    expect(ranked.map((row) => row.id)).toEqual([97, 89]);
    expect(ranked[0]!.rank).toBeGreaterThan(ranked[1]!.rank);
  });

  describe('negative controls', () => {
    it.each([
      [
        'the columns in one group instead of two',
        { groups: 'one' as const, language: 'english' as const },
      ],
      [
        'the groups in another order',
        { groups: 'reversed' as const, language: 'english' as const },
      ],
      ['another language', { groups: 'same' as const, language: 'german' as const }],
    ])('does not use the index for %s', async (_label, variant) => {
      const lowered = lower(
        db()
          .public.documents.select('id')
          .where((f, fns) => {
            const groups =
              variant.groups === 'one'
                ? [[f.title, f.subtitle, f.body]]
                : variant.groups === 'reversed'
                  ? [[f.body], [f.title, f.subtitle]]
                  : [[f.title, f.subtitle], [f.body]];
            return fns.fullTextMatches(groups, fns.websearchToTsquery(QUERY), {
              language: variant.language,
            });
          })
          .build(),
      );

      const plan = await explain(lowered.sql, lowered.params);
      expect(indexNames(plan)).not.toContain(searchIndex.name);
    });
  });
});
