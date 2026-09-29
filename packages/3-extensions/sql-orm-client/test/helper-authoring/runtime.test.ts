import { describe, expect, it } from 'vitest';
import { orm } from '../../src/orm';
import contractJson from '../fixtures/generated/contract.json' with { type: 'json' };
import {
  buildTestContextFromContract,
  createMockRuntime,
  deserializeTestContract,
  isSelectAst,
} from '../helpers';
import { fulltextSearchScopes as a1 } from './a1-hand-written';
import { fulltextSearchScopes as a3p } from './a3-placeholder';
import { fulltextSearchScopes as a3s } from './a3-slots';
import { fulltextSearchScopes as a4i } from './a4-several-instantiated';
import { fulltextSearchScopes as a5 } from './a5-collection';
import { fulltextSearchScopes as a6 } from './a6-instantiated';
import { fakeTsQuery, type HelperContract, postIndexesJson } from './fixture';

function helperContract(): HelperContract {
  const json = JSON.parse(JSON.stringify(contractJson));
  const posts = json.storage.namespaces.public.entries.table.posts;
  posts.indexes = [...posts.indexes, ...postIndexesJson];
  return deserializeTestContract(json) as unknown as HelperContract;
}

function setup() {
  const runtime = createMockRuntime();
  const db = orm({ runtime, context: buildTestContextFromContract(helperContract()) });
  return { runtime, db };
}

async function lastSelect(query: { all(): PromiseLike<unknown> }) {
  const { runtime } = current;
  await query.all();
  const ast = runtime.executions.at(-1)?.plan.ast;
  if (!isSelectAst(ast)) throw new Error('expected a select');
  return ast;
}

let current = setup();
const q = fakeTsQuery('hello');

describe('index scope helpers', () => {
  it.each([
    ['hand-written', a1],
    ['placeholder builder', a3p],
    ['slot interface', a3s],
    ['collection-returning builder', a5],
    ['instantiated kind', a6],
  ] as const)(
    '%s: offers only matching indexes and applies filter and order',
    async (_, helper) => {
      current = setup();
      const scopes = helper(current.db.public.Post);
      expect(Object.keys(scopes)).toEqual(['post_title_body_search']);
      const ast = await lastSelect(
        helper(current.db.public.Post.where((p) => p.views.gt(1))).post_title_body_search(q, {
          only: 'title',
        }),
      );
      expect(JSON.stringify(ast.where)).toContain('"title"');
      expect(JSON.stringify(ast.where)).toContain('%hello%');
      expect(ast.orderBy?.length).toBe(1);
    },
  );

  it('several operations per index', async () => {
    current = setup();
    const ast = await lastSelect(a4i(current.db.public.Post).post_title_body_search.phrase(q));
    expect(JSON.stringify(ast.where)).toContain('%hello%');
    expect(ast.orderBy ?? []).toEqual([]);
  });

  it('works inside an include refinement', async () => {
    current = setup();
    await current.db.public.User.include('posts', (posts) =>
      a6(posts).post_title_body_search(q).limit(2),
    ).all();
    expect(JSON.stringify(current.runtime.executions.at(-1)?.plan.ast)).toContain('%hello%');
  });
});
