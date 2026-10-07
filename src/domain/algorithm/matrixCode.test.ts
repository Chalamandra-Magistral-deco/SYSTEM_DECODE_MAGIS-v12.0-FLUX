import { describe, expect, test } from 'vitest';
import { calculateMatrixCode, digitalRoot } from './matrixCode';

describe('digitalRoot', () => {
  test.each([
    [0, 0],
    [1, 1],
    [9, 9],
    [10, 1],
    [18, 9],
    [19, 1],
    [27, 9],
    [28, 1],
    [99, 9],
    [100, 1],
  ])('digitalRoot(%s) = %s', (input, expected) => {
    expect(digitalRoot(input)).toBe(expected);
  });

  test('returns values from 1 through 9 for positive integers', () => {
    for (let value = 1; value <= 1000; value += 1) {
      const result = digitalRoot(value);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(9);
    }
  });
});

describe('calculateMatrixCode', () => {
  test.each([
    [[7, 10, 1990], '1 7 1 9'],
    [[15, 8, 2000], '8 6 2 7'],
    [[31, 12, 1999], '3 4 1 8'],
    [[1, 1, 2000], '1 1 2 4'],
  ])('%s -> %s', ([day, month, year], expected) => {
    expect(calculateMatrixCode(day, month, year)).toBe(expected);
  });

  test.each([
    [0, 0, 0],
    [0, 10, 2000],
    [10, 0, 2000],
    [10, 10, 0],
  ])('returns empty output for incomplete input: %s/%s/%s', (day, month, year) => {
    expect(calculateMatrixCode(day, month, year)).toBe('');
  });
});
