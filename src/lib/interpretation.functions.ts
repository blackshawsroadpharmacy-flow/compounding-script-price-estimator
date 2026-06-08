import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Step 2: AI prescription interpretation.
 *
 * Takes free-text prescription, asks Lovable AI to draft a structured
 * formulation, then grounds each ingredient against the pharmacy's
 * `ingredients_master` so the pharmacist's review in Step 3 starts with
 * supplier matches and ex-GST unit costs already attached.
 *
 * For unit-dose forms (capsule/troche/pessary) the draft is augmented with
 * the empty shell and a diluent filler so each unit is fully costed.
 */

export interface IngredientCandidate {
  id: string;
  ingredient: string;
  supplier: string | null;
  pack_size: string | null;
  canonical_unit: string | null;
  unit_cost_ex_gst: number | null;
  manual_check: boolean;
}

export interface InterpretedIngredient {
  name: string;
  role: "active" | "base" | "excipient";
  quantity: number;
  unit: string;
  strength?: string | null;
  lowConfidence: boolean;
  inferred: boolean;
  note?: string | null;
  /** Verbatim snippet from the prescription that motivated this line. */
  source?: string | null;
  /** mg of this ingredient per unit dose (capsule/troche). Audit only. */
  strengthMgPerUnit?: number | null;
  candidates: IngredientCandidate[];
}

export interface InterpretedFormulation {
  dosageForm: string;
  quantity: number;
  quantityUnit: string;
  /** Number of capsules/troches/pessaries when unit-dose, else null. */
  unitCount?: number | null;
  ingredients: InterpretedIngredient[];
  difficultyTags: { tag: string; multiplier: number; reason?: string }[];
  notes: string;
  reasoning: string;
  warnings: string[];
  overallConfidence: "high" | "medium" | "low";
  raw: string;
}

const InputSchema = z.object({
  text: z.string().min(3).max(8000),
});

const KNOWN_FORMS = [
  "capsule", "cream", "ointment", "gel", "paste", "lotion",
  "solution", "suspension", "liquid", "drops", "troche", "pessary",
];
const UNIT_DOSE_FORMS = new Set(["capsule", "troche", "pessary"]);
const CAPSULE_SIZES = ["000", "00", "0", "1", "2", "3", "4"] as const;
/** Default mg of fill per capsule shell, including active mass. */
const CAPSULE_FILL_MG: Record<string, number> = {
  "000": 1000, "00": 700, "0": 400, "1": 300, "2": 220, "3": 180, "4": 140,
};

const SYSTEM_PROMPT = `You are an experienced Australian compounding pharmacist's assistant.
Given a free-text prescription, return a STRUCTURED JSON draft of the compounded formulation.

Output JSON ONLY, matching EXACTLY this shape (no extra keys, no missing keys):
{
  "dosage_form": "<one of: ${KNOWN_FORMS.join(" | ")}>",
  "total_quantity": <number, total pack quantity to dispense>,
  "quantity_unit": "<one of: mg | g | mL | each>",
  "unit_count": <integer count of dose units when dosage_form is capsule/troche/pessary, else null>,
  "ingredients": [
    {
      "name": "<ingredient name>",
      "role": "<one of: active | base | excipient>",
      "quantity": <number for the WHOLE pack>,
      "unit": "<one of: mg | g | mL | each>",
      "strength": "<e.g. '1 mg' or '5%' or null>",
      "source": "<verbatim <=80 char snippet from prescription, or ''>",
      "low_confidence": <true|false>,
      "inferred": <true|false>,
      "note": "<short note or null>"
    }
  ],
  "difficulty_tags": ["standard" | "three_plus_actives" | "hazardous" | "moulded" | "sterile" | "hard_to_source" | "levigation"],
  "notes": "<optional pharmacist notes>",
  "reasoning": "<1-3 sentences>",
  "warnings": ["<any safety/ambiguity warnings>"]
}

Rules:
- EVERY top-level field above is REQUIRED. Never omit total_quantity or quantity_unit.
- For CAPSULES/TROCHES/PESSARIES: set quantity_unit to "each" and total_quantity to the number of units. Set unit_count to the same number. For each ACTIVE put the WHOLE-PACK mass (strength_per_unit_mg × unit_count) in "quantity" with unit "mg". DO NOT list capsule shells or filler — they are added automatically downstream.
- For creams/gels/ointments/lotions/solutions: quantity_unit g or mL, total_quantity is the pack size, ingredient quantities are for the whole pack.
- Always include "role" on every ingredient and "strength" where stated.
- Always include "standard" in difficulty_tags if nothing special applies.
- Output JSON ONLY, no prose, no markdown fences.`;

const ResponseSchema = z.object({
  dosage_form: z.string(),
  total_quantity: z.number().positive(),
  quantity_unit: z.string(),
  unit_count: z.number().nullable().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    role: z.enum(["active", "base", "excipient"]),
    quantity: z.number().nonnegative(),
    unit: z.string(),
    strength: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    low_confidence: z.boolean().optional(),
    inferred: z.boolean().optional(),
    note: z.string().nullable().optional(),
  })).min(1),
  difficulty_tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
  reasoning: z.string().default(""),
  warnings: z.array(z.string()).default([]),
});

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  standard: 1.0,
  three_plus_actives: 1.15,
  hazardous: 1.25,
  moulded: 1.20,
  sterile: 1.50,
  hard_to_source: 1.10,
  levigation: 1.15,
};

async function callGateway(text: string): Promise<z.infer<typeof ResponseSchema> & { __raw: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Prescription:\n${text}` },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit exceeded. Please wait and retry.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned non-JSON response.");
    parsed = JSON.parse(m[0]);
  }
  const coerced = coerceDraft(parsed);
  const ok = ResponseSchema.safeParse(coerced);
  if (!ok.success) {
    throw new Error(`AI response failed validation: ${ok.error.message.slice(0, 300)}`);
  }
  return Object.assign(ok.data, { __raw: content });
}

function coerceDraft(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, any>;

  const totalQty =
    r.total_quantity ?? r.pack_quantity ?? r.totalQuantity ?? r.pack_size ?? r.quantity;
  const qtyUnit =
    r.quantity_unit ?? r.pack_unit ?? r.quantityUnit ?? r.unit ?? r.uom;

  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const mapped = ingredients.map((i: any, idx: number) => {
    const role = (i.role ?? i.ingredient_role ?? i.type ?? (idx === 0 ? "active" : "excipient"))
      .toString().toLowerCase();
    const normRole = ["active", "base", "excipient"].includes(role) ? role : "excipient";
    return {
      ...i,
      role: normRole,
      name: i.name ?? i.ingredient ?? "",
      quantity: typeof i.quantity === "number" ? i.quantity : Number(i.quantity ?? i.amount ?? 0),
      unit: i.unit ?? i.uom ?? "mg",
    };
  });

  return {
    ...r,
    dosage_form: r.dosage_form ?? r.dosageForm ?? r.form ?? "cream",
    total_quantity: typeof totalQty === "number" ? totalQty : Number(totalQty ?? 0),
    quantity_unit: qtyUnit ?? "g",
    unit_count: r.unit_count ?? r.unitCount ?? null,
    ingredients: mapped,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Matcher

const STOPWORDS = new Set([
  "powder", "usp", "bp", "ph", "eur", "ep", "nf", "jp", "ar", "lr",
  "cream", "ointment", "gel", "paste", "lotion", "solution", "suspension",
  "liquid", "drops", "capsule", "capsules", "troche", "troches", "pessary",
  "pessaries", "tablet", "tablets", "for", "with", "and", "the", "of",
  "grade", "anhydrous", "hydrate", "monohydrate", "micronised", "micronized",
  "base", "vehicle", "qs", "ad", "to", "mg", "g", "ml", "mcg", "ug",
]);

const CAPSULE_SHELL_RE = /\b(empty\s+capsule|capsule\s+shell|gelatin\s+capsule|hpmc\s+capsule|veg(?:etarian)?\s*caps?|hard\s+capsule)\b/i;

function extractCapsuleSize(text: string): typeof CAPSULE_SIZES[number] | null {
  // Match "size 0", "#00", "no. 1", "size: 000" (longest first)
  for (const s of CAPSULE_SIZES) {
    const re = new RegExp(`(?:size|#|no\\.?)\\s*${s}\\b|\\bsize\\s+${s}\\b|\\b${s}\\s*(?:size|cap)`, "i");
    if (re.test(text)) return s;
  }
  return null;
}

function parseUnitCount(text: string): number | null {
  // "x 100", "× 100", "qty 100", "100 caps", "Dispense 100"
  const patterns = [
    /[x×]\s*(\d{1,4})\b/i,
    /\b(?:qty|quantity|disp(?:ense)?|mitte|mit)\s*[:#]?\s*(\d{1,4})\b/i,
    /\b(\d{1,4})\s*(?:cap(?:s|sules)?|troches?|pessar(?:y|ies))\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n <= 5000) return n;
    }
  }
  return null;
}

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9%]+/i)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

async function fetchByMatchKey(matchKey: string): Promise<IngredientCandidate[]> {
  const { data } = await supabaseAdmin
    .from("ingredients_master")
    .select("id,ingredient,supplier,pack_size,canonical_unit,unit_cost_ex_gst,manual_check")
    .eq("match_key", matchKey)
    .order("unit_cost_ex_gst", { ascending: true, nullsFirst: false })
    .limit(5);
  return (data ?? []) as IngredientCandidate[];
}

/**
 * Token-aware candidate search. Ranks ingredients_master rows by how many of
 * the salient tokens from `name` are contained in `ingredient`, then by cost.
 */
async function findCandidates(name: string): Promise<IngredientCandidate[]> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];

  // Capsule shell short-circuit.
  if (CAPSULE_SHELL_RE.test(trimmed)) {
    const size = extractCapsuleSize(trimmed) ?? "0";
    const rows = await fetchByMatchKey(`capsule_shell_size_${size}`);
    if (rows.length) return rows;
  }

  const toks = tokens(trimmed);
  if (toks.length === 0) {
    // Fall back to literal name search.
    const { data } = await supabaseAdmin
      .from("ingredients_master")
      .select("id,ingredient,supplier,pack_size,canonical_unit,unit_cost_ex_gst,manual_check")
      .ilike("ingredient", `%${trimmed}%`)
      .order("unit_cost_ex_gst", { ascending: true, nullsFirst: false })
      .limit(5);
    return (data ?? []) as IngredientCandidate[];
  }

  // Query the longest (most specific) token first; widen with shorter tokens
  // if it returns nothing.
  const ordered = [...toks].sort((a, b) => b.length - a.length);
  let rows: IngredientCandidate[] = [];
  for (const tk of ordered) {
    const { data } = await supabaseAdmin
      .from("ingredients_master")
      .select("id,ingredient,supplier,pack_size,canonical_unit,unit_cost_ex_gst,manual_check")
      .ilike("ingredient", `%${tk}%`)
      .limit(40);
    if (data && data.length) {
      rows = data as IngredientCandidate[];
      break;
    }
  }
  if (rows.length === 0) return [];

  // Rank: more matched tokens wins; ties broken by cheaper unit cost.
  const scored = rows.map((r) => {
    const hay = r.ingredient.toLowerCase();
    const matches = toks.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
    return { r, matches };
  });
  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    const ac = a.r.unit_cost_ex_gst ?? Number.POSITIVE_INFINITY;
    const bc = b.r.unit_cost_ex_gst ?? Number.POSITIVE_INFINITY;
    return ac - bc;
  });
  return scored.slice(0, 5).map((s) => s.r);
}

// ──────────────────────────────────────────────────────────────────────────────
// Capsule pack assembly

function toMg(qty: number, unit: string): number {
  if (unit === "mg") return qty;
  if (unit === "g") return qty * 1000;
  if (unit === "mcg" || unit === "ug" || unit === "µg") return qty / 1000;
  return 0;
}

function parseStrengthMg(strength: string | null | undefined): number | null {
  if (!strength) return null;
  const m = strength.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|ug|µg)\b/i);
  if (!m) return null;
  return toMg(Number(m[1]), m[2].toLowerCase());
}

/**
 * For capsule/troche/pessary, ensure the BOM has a shell line and a filler
 * line that scale with unit count. Active masses are converted to whole-pack
 * mg. Mutates `out` in place and returns it.
 */
async function assembleUnitDosePack(
  rxText: string,
  draft: z.infer<typeof ResponseSchema>,
  grounded: InterpretedIngredient[],
  warnings: string[],
): Promise<{ ingredients: InterpretedIngredient[]; unitCount: number; shellSize: string }> {
  // Resolve unit count.
  let unitCount =
    (draft.unit_count && Number(draft.unit_count) > 0 ? Number(draft.unit_count) : null) ??
    (draft.quantity_unit?.toLowerCase() === "each" ? draft.total_quantity : null) ??
    parseUnitCount(rxText) ??
    null;
  if (!unitCount || unitCount <= 0) {
    unitCount = 30;
    warnings.push("Unit count could not be detected — defaulted to 30 capsules");
  }

  const shellSize = extractCapsuleSize(rxText) ?? "0";

  // Normalise active rows: ensure whole-pack mg quantity, and stamp strengthMgPerUnit.
  const ingredients: InterpretedIngredient[] = grounded
    .filter((ing) => {
      // Drop AI-supplied shell/filler lines — we add canonical ones below.
      if (CAPSULE_SHELL_RE.test(ing.name)) return false;
      const n = ing.name.toLowerCase();
      if (ing.role !== "active" && (n.includes("avicel") || n.includes("microcrystalline") || n.includes("lactose") || n.includes("filler") || n.includes("diluent"))) {
        return false;
      }
      return true;
    })
    .map((ing) => {
      if (ing.role !== "active") return ing;
      const strengthMg = parseStrengthMg(ing.strength ?? null);
      const qtyMg = ing.unit === "each" ? (strengthMg ?? 0) * unitCount! : toMg(ing.quantity, ing.unit);
      const perUnit = strengthMg ?? (qtyMg > 0 ? qtyMg / unitCount! : null);
      return {
        ...ing,
        quantity: qtyMg > 0 ? qtyMg : ing.quantity,
        unit: "mg",
        strengthMgPerUnit: perUnit,
      };
    });

  // Total active mg per single capsule (to compute filler).
  const activeMgPerUnit = ingredients
    .filter((i) => i.role === "active")
    .reduce((s, i) => s + (i.strengthMgPerUnit ?? (i.quantity / unitCount!)), 0);

  // Shell line.
  const shellCandidates = await fetchByMatchKey(`capsule_shell_size_${shellSize}`);
  ingredients.push({
    name: `Empty Capsule Shell Size ${shellSize}`,
    role: "base",
    quantity: unitCount,
    unit: "each",
    strength: null,
    lowConfidence: false,
    inferred: true,
    note: `Auto-added: ${unitCount} × size-${shellSize} shell`,
    source: null,
    strengthMgPerUnit: null,
    candidates: shellCandidates,
  });
  if (shellCandidates.length === 0) {
    warnings.push(`No price found for capsule_shell_size_${shellSize} — add to ingredients_master`);
  }

  // Filler line.
  const fillTarget = CAPSULE_FILL_MG[shellSize] ?? 400;
  const fillerPerUnit = Math.max(0, fillTarget - activeMgPerUnit);
  const fillerTotalMg = Math.round(fillerPerUnit * unitCount);
  const fillerCandidates = await fetchByMatchKey("capsule_filler_avicel");
  ingredients.push({
    name: "Microcrystalline Cellulose (Avicel) — Capsule Filler",
    role: "excipient",
    quantity: fillerTotalMg,
    unit: "mg",
    strength: null,
    lowConfidence: false,
    inferred: true,
    note: `Auto-added: ${Math.round(fillerPerUnit)} mg diluent × ${unitCount} caps (size-${shellSize} fill ${fillTarget} mg − ${Math.round(activeMgPerUnit)} mg active)`,
    source: null,
    strengthMgPerUnit: fillerPerUnit,
    candidates: fillerCandidates,
  });
  if (fillerCandidates.length === 0) {
    warnings.push("No price found for capsule_filler_avicel — add to ingredients_master");
  }

  return { ingredients, unitCount, shellSize };
}

export const interpretPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<InterpretedFormulation> => {
    const draft = await callGateway(data.text);

    const warnings: string[] = [...(draft.warnings ?? [])];

    const dosageForm = KNOWN_FORMS.includes(draft.dosage_form.toLowerCase())
      ? draft.dosage_form.toLowerCase()
      : (warnings.push(`Unrecognised dosage form "${draft.dosage_form}", defaulted to cream`), "cream");

    // Ground every AI ingredient against ingredients_master.
    let grounded: InterpretedIngredient[] = await Promise.all(
      draft.ingredients.map(async (ing) => {
        const candidates = await findCandidates(ing.name);
        const lowConfidence = Boolean(ing.low_confidence) || candidates.length === 0;
        if (candidates.length === 0) {
          warnings.push(`No supplier match found for "${ing.name}"`);
        }
        return {
          name: ing.name,
          role: ing.role,
          quantity: ing.quantity,
          unit: ing.unit,
          strength: ing.strength ?? null,
          source: ing.source ?? null,
          lowConfidence,
          inferred: Boolean(ing.inferred),
          note: ing.note ?? null,
          strengthMgPerUnit: null,
          candidates,
        };
      }),
    );

    let unitCount: number | null = null;
    let packQty = draft.total_quantity;
    let packUnit = draft.quantity_unit;

    if (UNIT_DOSE_FORMS.has(dosageForm)) {
      const assembled = await assembleUnitDosePack(data.text, draft, grounded, warnings);
      grounded = assembled.ingredients;
      unitCount = assembled.unitCount;
      packQty = unitCount;
      packUnit = "each";
    }

    const difficultyTags = (draft.difficulty_tags.length ? draft.difficulty_tags : ["standard"])
      .filter((t) => t in DIFFICULTY_MULTIPLIERS)
      .map((t) => ({ tag: t, multiplier: DIFFICULTY_MULTIPLIERS[t] }));
    if (difficultyTags.length === 0) {
      difficultyTags.push({ tag: "standard", multiplier: 1.0 });
    }

    const anyManual = grounded.some(
      (i) => i.candidates.length === 0 || i.candidates.every((c) => c.manual_check || c.unit_cost_ex_gst == null),
    );
    const anyLow = grounded.some((i) => i.lowConfidence);
    const overallConfidence: InterpretedFormulation["overallConfidence"] =
      anyManual ? "low" : anyLow ? "medium" : "high";

    return {
      dosageForm,
      quantity: packQty,
      quantityUnit: packUnit,
      unitCount,
      ingredients: grounded,
      difficultyTags,
      notes: draft.notes ?? "",
      reasoning: draft.reasoning ?? "",
      warnings,
      overallConfidence,
      raw: draft.__raw,
    };
  });
