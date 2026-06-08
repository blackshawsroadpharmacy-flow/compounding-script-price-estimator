/**
 * Burke Road Compounding pricing engine.
 *
 * Price (ex-GST) = (Ingredients + Labour + Packaging) × Difficulty × Markup
 * Labour = Prep (fixed minutes) + Make-time (per form) @ hourly rate
 * Price (inc-GST) = Price (ex-GST) × (1 + gst if taxable else 1)
 *
 * All ingredient costs are ex-GST (already normalised in ingredients_master).
 * GST is applied once at the end, only when the finished item is taxable.
 */

export type IngredientRole = "active" | "base" | "excipient" | "packaging";

export interface BomLine {
  id: string;
  name: string;
  role: IngredientRole;
  quantity: number;
  unit: string; // mg | mL | each | g
  unitCostExGst: number | null; // null when manual price needed
  matchedIngredientId?: string | null;
  matchedSupplier?: string | null;
  wastagePct?: number; // 0..100
  manualPriceNeeded?: boolean;
  lowConfidence?: boolean;
  note?: string;
}

export interface PackagingLine {
  id: string;
  name: string;
  category: string;
  unitCostExGst: number;
  quantity: number;
}

export interface PricingInputs {
  bom: BomLine[];
  packaging: PackagingLine[];
  difficultyTags: { tag: string; multiplier: number }[];
  hourlyRate: number; // $/hr
  prepMinutes: number; // fixed
  makeMinutes: number; // form-specific
  markup: number; // e.g. 1.236
  taxable: boolean;
  gstRate: number; // e.g. 0.10
}

export interface PricingBreakdown {
  ingredientLines: { id: string; name: string; cost: number; warning?: string }[];
  packagingLines: { id: string; name: string; cost: number }[];
  ingredientsTotal: number;
  packagingTotal: number;
  prepCost: number;
  makeCost: number;
  labourTotal: number;
  baseCost: number; // before difficulty + markup
  difficulty: number;
  markup: number;
  costAfterDifficulty: number;
  priceExGst: number;
  gst: number;
  priceIncGst: number;
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

export function calculatePrice(input: PricingInputs): PricingBreakdown {
  const warnings: string[] = [];

  const ingredientLines = input.bom.map((line) => {
    if (line.manualPriceNeeded || line.unitCostExGst == null) {
      warnings.push(`Manual price needed: ${line.name}`);
      return { id: line.id, name: line.name, cost: 0, warning: "manual price needed" };
    }
    const wastage = 1 + (line.wastagePct ?? 0) / 100;
    const cost = line.quantity * line.unitCostExGst * wastage;
    return { id: line.id, name: line.name, cost };
  });

  const packagingLines = input.packaging.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.quantity * p.unitCostExGst,
  }));

  const ingredientsTotal = ingredientLines.reduce((s, l) => s + l.cost, 0);
  const packagingTotal = packagingLines.reduce((s, l) => s + l.cost, 0);

  const prepCost = (input.prepMinutes / 60) * input.hourlyRate;
  const makeCost = (input.makeMinutes / 60) * input.hourlyRate;
  const labourTotal = prepCost + makeCost;

  const baseCost = ingredientsTotal + labourTotal + packagingTotal;

  const difficulty = input.difficultyTags.reduce(
    (acc, t) => acc * (t.multiplier || 1),
    1,
  );
  const costAfterDifficulty = baseCost * difficulty;
  const priceExGst = costAfterDifficulty * input.markup;
  const gst = input.taxable ? priceExGst * input.gstRate : 0;
  const priceIncGst = priceExGst + gst;

  const lowConfBom = input.bom.some((l) => l.lowConfidence);
  const manualBom = input.bom.some((l) => l.manualPriceNeeded || l.unitCostExGst == null);
  let confidence: PricingBreakdown["confidence"] = "high";
  if (manualBom) confidence = "low";
  else if (lowConfBom) confidence = "medium";

  if (input.bom.length === 0) {
    warnings.push("No ingredients added");
    confidence = "low";
  }

  return {
    ingredientLines,
    packagingLines,
    ingredientsTotal,
    packagingTotal,
    prepCost,
    makeCost,
    labourTotal,
    baseCost,
    difficulty,
    markup: input.markup,
    costAfterDifficulty,
    priceExGst,
    gst,
    priceIncGst,
    warnings,
    confidence,
  };
}

export function formatMoney(n: number) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
