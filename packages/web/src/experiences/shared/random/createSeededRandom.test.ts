import { describe, it, expect } from 'vitest';
import { createSeededRandom } from './createSeededRandom';

describe('createSeededRandom', () => {
  it('produces identical sequences for identical numeric seeds', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);

    for (let i = 0; i < 10; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces identical sequences for identical string seeds', () => {
    const rng1 = createSeededRandom('test-seed');
    const rng2 = createSeededRandom('test-seed');

    for (let i = 0; i < 10; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different sequences for different numeric seeds', () => {
    const rng1 = createSeededRandom(1);
    const rng2 = createSeededRandom(2);

    const vals1: number[] = [];
    const vals2: number[] = [];

    for (let i = 0; i < 5; i++) {
      vals1.push(rng1());
      vals2.push(rng2());
    }

    // At least one value should differ (with overwhelming probability)
    expect(vals1.some((v, i) => v !== vals2[i])).toBe(true);
  });

  it('produces different sequences for different string seeds', () => {
    const rng1 = createSeededRandom('seed-a');
    const rng2 = createSeededRandom('seed-b');

    const vals1: number[] = [];
    const vals2: number[] = [];

    for (let i = 0; i < 5; i++) {
      vals1.push(rng1());
      vals2.push(rng2());
    }

    expect(vals1.some((v, i) => v !== vals2[i])).toBe(true);
  });

  it('returns values in [0, 1) range', () => {
    const rng = createSeededRandom(999);

    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('handles string seeds correctly regardless of length', () => {
    const short = createSeededRandom('x');
    const long = createSeededRandom('very-long-seed-string-with-many-characters');

    const shortVal = short();
    const longVal = long();

    expect(shortVal).toBeGreaterThanOrEqual(0);
    expect(shortVal).toBeLessThan(1);
    expect(longVal).toBeGreaterThanOrEqual(0);
    expect(longVal).toBeLessThan(1);
    expect(shortVal).not.toBe(longVal);
  });

  it('produces consistent sequences across multiple calls', () => {
    const rng = createSeededRandom(12345);
    const sequence1 = [rng(), rng(), rng(), rng(), rng()];

    const rng2 = createSeededRandom(12345);
    const sequence2 = [rng2(), rng2(), rng2(), rng2(), rng2()];

    expect(sequence1).toEqual(sequence2);
  });

  it('verifies first value for seed 42 (regression check)', () => {
    const rng = createSeededRandom(42);
    const first = rng();
    expect(first).toBeCloseTo(0.6011037519201636, 10);
  });

  it('verifies first value for string seed "test" (regression check)', () => {
    const rng = createSeededRandom('test');
    const first = rng();
    expect(first).toBeCloseTo(0.7171058997046202, 10);
  });
});
