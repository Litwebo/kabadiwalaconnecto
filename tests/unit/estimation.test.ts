import { beforeAll, describe, expect, it } from 'vitest';
import { median } from '../../src/shared/format.ts';

let computeEstimateForItems: typeof import('../../src/server/services/lots.ts').computeEstimateForItems;

beforeAll(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  const { seedDatabase } = await import('../../src/server/seed.ts');
  await seedDatabase(true);
  const lotsMod = await import('../../src/server/services/lots.ts');
  computeEstimateForItems = lotsMod.computeEstimateForItems;
});

describe('Price Estimation Engine', () => {
  it('calculates exact median for odd and even arrays', () => {
    expect(median([100, 300, 200])).toBe(200);
    expect(median([100, 200, 300, 400])).toBe(250);
    expect(median([])).toBe(0);
  });

  it('uses regional median of active approved recyclers and returns -10% to +10% range', () => {
    // Near Kankanady, Mangaluru: GreenEarth (660), Canara (645), Coastal (695) -> median is 660
    const est = computeEstimateForItems(12.8732, 74.8554, [
      { categoryId: 'cat_copper', declaredKg: 10 },
    ]);

    expect(est.totalKg).toBe(10);
    expect(est.hasHazardous).toBe(false);
    expect(est.items[0].source).toBe('REGIONAL_MEDIAN');
    expect(est.items[0].medianRatePerKg).toBe(660);
    expect(est.items[0].recyclerSampleCount).toBe(3);
    expect(est.midTotal).toBe(6600);
    expect(est.lowTotal).toBe(5940);
    expect(est.highTotal).toBe(7260);
  });

  it('falls back to admin reference rate when no approved recyclers exist within 40km', () => {
    // Coordinates in Bengaluru (~350km from Mangaluru) -> no regional recyclers -> fallback
    const est = computeEstimateForItems(12.9716, 77.5946, [
      { categoryId: 'cat_copper', declaredKg: 5 },
      { categoryId: 'cat_batteries', declaredKg: 4 },
    ]);

    expect(est.hasHazardous).toBe(true);
    expect(est.items[0].source).toBe('REFERENCE_RATE');
    expect(est.items[0].medianRatePerKg).toBe(640);
    expect(est.items[1].source).toBe('REFERENCE_RATE');
    expect(est.items[1].medianRatePerKg).toBe(115);
    expect(est.midTotal).toBe(5 * 640 + 4 * 115);
  });
});
