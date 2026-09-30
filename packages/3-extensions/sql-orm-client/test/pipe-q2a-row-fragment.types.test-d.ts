import { describe, expectTypeOf, test } from 'vitest';
import { Collection } from '../src/collection';
import { and } from '../src/filters';
import type { FieldExpression, ModelAccessor } from '../src/types';
import { type SoftDeleteContract, softDeleteSetup } from './pipe-fragments-fixture';

type DeletedAt = FieldExpression<SoftDeleteContract, 'pg/timestamptz-date@1', true>;

const notDeleted = (p: { readonly deletedAt: DeletedAt }) => p.deletedAt.isNull();
const deletedBefore = (p: { readonly deletedAt: DeletedAt }, date: Date) => p.deletedAt.lt(date);

const { db } = softDeleteSetup();

class SoftPosts extends Collection<SoftDeleteContract, 'Post'> {
  live() {
    return this.where(notDeleted);
  }
}

describe('a row fragment typed by codec and nullability', () => {
  test('the real field type is assignable to the codec-keyed type', () => {
    type Real = ModelAccessor<SoftDeleteContract, 'Post', 'public'>['deletedAt'];
    expectTypeOf<Real>().toExtend<DeletedAt>();
    expectTypeOf<DeletedAt>().toExtend<Real>();
    expectTypeOf<DeletedAt>().not.toBeAny();
  });

  test('passed to where on a root, chained, include and custom collection', () => {
    expectTypeOf(db.public.Post.where(notDeleted)).not.toBeAny();
    expectTypeOf(db.public.Comment.where(notDeleted)).not.toBeAny();
    expectTypeOf(
      db.public.Post.where((p) => and(notDeleted(p), p.title.eq('t'))).all(),
    ).not.toBeAny();
    expectTypeOf(
      db.public.Post.select('id').where((p) => deletedBefore(p, new Date())),
    ).not.toBeAny();
    expectTypeOf(
      db.public.User.include('posts', (posts) => posts.where(notDeleted)).all(),
    ).not.toBeAny();
    const instance = null as unknown as SoftPosts;
    expectTypeOf(instance.live().update).parameter(0).not.toBeNever();
  });

  test('offers the operations of the codec', () => {
    expectTypeOf<DeletedAt['desc']>().not.toBeNever();
    expectTypeOf<Date>().toExtend<Parameters<DeletedAt['gt']>[0]>();
    expectTypeOf<string>().not.toExtend<Parameters<DeletedAt['gt']>[0]>();
    type Title = FieldExpression<SoftDeleteContract, 'pg/text@1'>;
    expectTypeOf<Title['like']>().not.toBeNever();
    expectTypeOf<ModelAccessor<SoftDeleteContract, 'Post', 'public'>['title']>().toExtend<Title>();
  });

  test('rejected for a model without the field or with another codec or nullability', () => {
    // @ts-expect-error Tag has no deletedAt
    db.public.Tag.where(notDeleted);
    // @ts-expect-error User has no deletedAt
    db.public.User.where((u) => notDeleted(u));
    const intTitle = (p: { readonly title: FieldExpression<SoftDeleteContract, 'pg/int4@1'> }) =>
      p.title.eq(1);
    // @ts-expect-error title is text, not int4
    db.public.Post.where(intTitle);
    const requiredDeletedAt = (p: {
      readonly deletedAt: FieldExpression<SoftDeleteContract, 'pg/timestamptz-date@1', false>;
    }) => p.deletedAt.isNull();
    // @ts-expect-error deletedAt is nullable
    db.public.Post.where(requiredDeletedAt);
  });
});
