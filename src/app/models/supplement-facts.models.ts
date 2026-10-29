export type SupplementFactsStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SOURCE_MATCHED'
  | 'NOT_FOUND'
  | 'FAILED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_MISMATCH'
  | 'ERROR';

export interface SupplementFactsSource {
  url: string | null;
  title: string | null;
  retrievedAt: string | null;
}

export interface NutritionFactRow {
  name: string;
  amount: string;
  dailyValue: string | null;
}

export interface SupplementFacts {
  manufacturer: string | null;
  manufacturerDomain: string | null;
  source: SupplementFactsSource;
  servingSize: string | null;
  servingsPerContainer: string | null;
  usageInstructions: string | null;
  ingredients: string | null;
  allergenStatement: string | null;
  warnings: string[];
  nutritionFacts: NutritionFactRow[];
  status: SupplementFactsStatus | string | null;
  exactProductMatch: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function text(record: UnknownRecord, keys: string[]): string | null {
  const value = firstValue(record, keys);
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function displayAmount(record: UnknownRecord): string {
  const amount = text(record, ['amount', 'value', 'quantity']) ?? '';
  const unit = text(record, ['unit']);
  return unit && !amount.toLowerCase().endsWith(unit.toLowerCase()) ? `${amount} ${unit}`.trim() : amount;
}

function dailyValue(record: UnknownRecord): string | null {
  const value = firstValue(record, ['dailyValue', 'dailyValuePercent', 'percentDailyValue', 'percentDv']);
  if (typeof value === 'number') return `${value}%`;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  const cameFromPercentField = record['dailyValue'] === undefined;
  return cameFromPercentField && /^\d+(?:[.,]\d+)?$/.test(normalized) ? `${normalized}%` : normalized;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function nutritionRows(value: unknown): NutritionFactRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = text(item, ['name', 'nutrient', 'label']);
    const amount = displayAmount(item);
    if (!name || !amount) return [];
    return [{
      name,
      amount,
      dailyValue: dailyValue(item),
    }];
  });
}

function factsCandidate(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) return null;

  const nested = firstValue(value, ['supplementFacts', 'productFacts', 'labelFacts', 'facts']);
  if (isRecord(nested)) return nested;
  if (isRecord(value['data'])) return factsCandidate(value['data']);
  return value;
}

/** Keeps backend naming variations at the API boundary. */
export function normalizeSupplementFacts(value: unknown): SupplementFacts | null {
  const facts = factsCandidate(value);
  if (!facts) return null;

  const sourceValue = firstValue(facts, ['source']);
  const source = isRecord(sourceValue) ? sourceValue : {};
  const result: SupplementFacts = {
    manufacturer: text(facts, ['manufacturer']),
    manufacturerDomain: text(facts, ['manufacturerDomain']),
    source: {
      url: text(source, ['url']) ?? text(facts, ['sourceUrl']),
      title: text(source, ['title']) ?? text(facts, ['title', 'sourceTitle']),
      retrievedAt: text(source, ['retrievedAt']) ?? text(facts, ['retrievedAt', 'sourceRetrievedAt']),
    },
    servingSize: text(facts, ['servingSize']),
    servingsPerContainer: text(facts, ['servingsPerContainer']),
    usageInstructions: text(facts, ['usageInstructions', 'directions']),
    ingredients: text(facts, ['ingredients']),
    allergenStatement: text(facts, ['allergenStatement', 'allergens']),
    warnings: stringList(firstValue(facts, ['warnings'])),
    nutritionFacts: nutritionRows(firstValue(facts, ['nutritionFacts', 'nutritionRows'])),
    status: text(facts, ['status']),
    exactProductMatch: firstValue(facts, ['exactProductMatch']) === true,
  };

  const hasContent = Object.values(result).some((entry) =>
    Array.isArray(entry)
      ? entry.length > 0
      : typeof entry === 'object' && entry !== null
        ? Object.values(entry).some(Boolean)
        : Boolean(entry),
  );
  return hasContent ? result : null;
}

export function isPublicSupplementFacts(facts: SupplementFacts | null | undefined): facts is SupplementFacts {
  if (facts?.status !== 'SOURCE_MATCHED' || !facts.exactProductMatch) return false;
  return Boolean(
    facts.manufacturer
    || facts.source.url
    || facts.servingSize
    || facts.servingsPerContainer
    || facts.usageInstructions
    || facts.ingredients
    || facts.allergenStatement
    || facts.warnings.length
    || facts.nutritionFacts.length,
  );
}
