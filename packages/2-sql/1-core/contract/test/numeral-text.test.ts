import { describe, expect, it } from 'vitest';
import { isNonFiniteText, numeralText } from '../src/numeral-text';

describe('numeralText', () => {
  it.each([
    ['writes a large number without an exponent', 1e21, '1000000000000000000000'],
    ['writes a small number without an exponent', 1e-7, '0.0000001'],
    ['leaves an ordinary number alone', 1.5, '1.5'],
    ['writes a negative large number without an exponent', -1e21, '-1000000000000000000000'],
    ['writes a negative small number without an exponent', -1e-7, '-0.0000001'],
    ['writes a word for a non-finite number', Number.NaN, 'NaN'],
  ])('%s', (_name, value, text) => {
    expect(numeralText(value)).toBe(text);
  });
});

describe('isNonFiniteText', () => {
  it.each(['NaN', 'Infinity', '-Infinity'])('reads %s as a non-finite word', (text) => {
    expect(isNonFiniteText(text)).toBe(true);
  });

  it.each(['0', '-42', '1.50', '1e3', '', 'nan'])('reads %o as no non-finite word', (text) => {
    expect(isNonFiniteText(text)).toBe(false);
  });
});
