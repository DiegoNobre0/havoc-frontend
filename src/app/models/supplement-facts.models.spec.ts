import { describe, expect, it } from 'vitest';
import { isPublicSupplementFacts, normalizeSupplementFacts } from './supplement-facts.models';

describe('supplement facts contract', () => {
  it('normalizes the backend facts object and nutrition rows', () => {
    const facts = normalizeSupplementFacts({
      supplementFacts: {
        manufacturer: 'Havoc Labs',
        sourceUrl: 'https://havoclabs.example/product',
        title: 'Product label',
        retrievedAt: '2026-10-23T12:00:00Z',
        servingSize: '30 g',
        status: 'SOURCE_MATCHED',
        exactProductMatch: true,
        nutritionFacts: [
          { nutrient: 'Protein', amount: 24, unit: 'g', dailyValuePercent: 48 },
          { name: 'Creatine', amount: '3 g' },
        ],
      },
    });

    expect(facts).toMatchObject({
      manufacturer: 'Havoc Labs',
      source: {
        url: 'https://havoclabs.example/product',
        title: 'Product label',
        retrievedAt: '2026-10-23T12:00:00Z',
      },
      nutritionFacts: [
        { name: 'Protein', amount: '24 g', dailyValue: '48%' },
        { name: 'Creatine', amount: '3 g', dailyValue: null },
      ],
    });
    expect(isPublicSupplementFacts(facts)).toBe(true);
  });

  it('does not approve mismatched or inexact facts for the public page', () => {
    const mismatch = normalizeSupplementFacts({ status: 'SOURCE_MISMATCH', exactProductMatch: true });
    const inexact = normalizeSupplementFacts({ status: 'SOURCE_MATCHED', exactProductMatch: false });

    expect(isPublicSupplementFacts(mismatch)).toBe(false);
    expect(isPublicSupplementFacts(inexact)).toBe(false);
    expect(isPublicSupplementFacts(normalizeSupplementFacts({
      status: 'SOURCE_MATCHED',
      exactProductMatch: true,
    }))).toBe(false);
    expect(normalizeSupplementFacts(null)).toBeNull();
  });
});
