import type { OrderByItem } from '@internal/sql-relational-core/ast';
import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import type { Ordered } from '../src/collection-types';
import { type SortDirection, sortField } from '../src/query-fragments';
import type { ModelFieldCodec, Orderable, SortableFieldName } from '../src/types';
import { createChainingOrm, type PostCollection } from './collection-chaining-fixture';
import type { TestContract } from './helpers';

declare const input: { sort: string; direction: SortDirection };

const { db, plain } = createChainingOrm();

class SortedPostCollection extends Collection<TestContract, 'Post'> {
  sorted(name: string) {
    return this.orderBy(sortField(this, name, 'desc', ['title', 'views']));
  }
}

describe('SortableFieldName', () => {
  test('names the fields whose codec can be ordered', () => {
    expectTypeOf<SortableFieldName<TestContract, 'Post'>>().toEqualTypeOf<
      'id' | 'title' | 'userId' | 'views'
    >();
  });
});

describe('ModelFieldCodec', () => {
  test('gives a field codec and nullability', () => {
    expectTypeOf<ModelFieldCodec<TestContract, 'Post', 'title'>>().toEqualTypeOf<{
      readonly codecId: 'pg/text@1';
      readonly nullable: false;
    }>();
    expectTypeOf<ModelFieldCodec<TestContract, 'User', 'invitedById'>>().toEqualTypeOf<{
      readonly codecId: 'pg/int4@1';
      readonly nullable: true;
    }>();
  });
});

describe('sortField', () => {
  test('returns an orderBy selector over the allowed fields', () => {
    const selector = sortField(db.Post, input.sort, input.direction, ['title', 'views']);
    expectTypeOf(selector).toEqualTypeOf<
      (row: { readonly title: Orderable; readonly views: Orderable }) => OrderByItem
    >();
  });

  test('allows every sortable field when no list is given', () => {
    expectTypeOf(sortField(db.Post, input.sort)).parameter(0).toEqualTypeOf<{
      readonly id: Orderable;
      readonly title: Orderable;
      readonly userId: Orderable;
      readonly views: Orderable;
    }>();
  });

  test('records the order, so cursor is allowed', () => {
    const posts = db.Post.orderBy(sortField(db.Post, input.sort, input.direction));
    expectTypeOf(posts).toEqualTypeOf<Ordered<PostCollection>>();
    expectTypeOf(posts.cursor({ id: 1 })).toEqualTypeOf<Ordered<PostCollection>>();
  });

  test('fits a chained collection, an include refinement and this', () => {
    expectTypeOf(
      db.Post.where({ title: 'x' }).orderBy(sortField(db.Post, input.sort)),
    ).not.toBeAny();
    db.User.include('posts', (posts) => posts.orderBy(sortField(posts, input.sort)));
    expectTypeOf<ReturnType<SortedPostCollection['sorted']>>().toEqualTypeOf<
      Ordered<SortedPostCollection>
    >();
  });

  test('fits another model that has the allowed fields', () => {
    plain.Article.orderBy(sortField(db.Post, input.sort, 'asc', ['title']));
    // @ts-expect-error Tag has no title
    plain.Tag.orderBy(sortField(db.Post, input.sort, 'asc', ['title']));
  });

  test('refuses a field that cannot be sorted in the allowed list', () => {
    // @ts-expect-error Post has no field nope
    sortField(db.Post, input.sort, 'asc', ['nope']);
    // @ts-expect-error the codec of embedding has no order trait
    sortField(db.Post, input.sort, 'asc', ['embedding']);
    // @ts-expect-error author is a relation
    sortField(db.Post, input.sort, 'asc', ['author']);
  });

  test('refuses a direction other than asc and desc', () => {
    // @ts-expect-error a direction is asc or desc
    sortField(db.Post, input.sort, 'up');
  });
});
