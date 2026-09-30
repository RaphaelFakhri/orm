import { describe, expect, it } from 'vitest';
import { claimingSqlTexts, sqlTypeTextsCollide } from '../src/sql-data-type';
import { char, int4, numeric, textArray, vector } from './sql-data-type-fixtures';

describe('claimingSqlTexts', () => {
  it('lists the texts marked catalog and the texts with neither mark', () => {
    expect(claimingSqlTexts(int4)).toEqual(['integer', 'int']);
    expect(claimingSqlTexts(char)).toEqual(['character({length})', 'char', 'char({length})']);
  });

  it('is empty for a type that claims nothing', () => {
    expect(claimingSqlTexts(textArray)).toEqual([]);
  });

  it('includes a text marked both written and catalog', () => {
    expect(claimingSqlTexts(vector)).toEqual(['vector({length})']);
    expect(claimingSqlTexts(numeric)).toContain('numeric');
  });
});

describe('sqlTypeTextsCollide', () => {
  it.each([
    ['int4', 'int4'],
    ['numeric({precision})', 'numeric({p})'],
    ['numeric({precision})', 'numeric(1)'],
    ['numeric(1)', 'numeric({precision})'],
    ['vector({length})', 'vector({dimensions})'],
  ])('%s collides with %s', (a, b) => {
    expect(sqlTypeTextsCollide(a, b)).toBe(true);
  });

  it.each([
    ['int', 'int4'],
    ['character({length})', 'character varying({length})'],
    ['timestamp({precision}) with time zone', 'timestamp({precision}) without time zone'],
    ['numeric({precision})', 'numeric({precision},{scale})'],
    ['bit', 'bit varying'],
  ])('%s does not collide with %s', (a, b) => {
    expect(sqlTypeTextsCollide(a, b)).toBe(false);
  });
});
