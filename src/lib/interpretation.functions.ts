import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Step 2: AI prescription interpretation.
 *
 * Takes free-text prescription, asks Lovable AI to draft a structured
 * formulation, then grounds each ingredient against the pharmacy's
 * `ingredients_master` so the pharmacist's review in Step 3 starts with
 * supplier matches and ex-GST unit costs already attached.
 */

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
  // Top supplier matches (cheapest valid first).
  candidates: {
    id: string;
    ingredient: string;
    supplier: string | null;
    pack_size: string | null;
    canonical_unit: string | null;
    unit_cost_ex_gst: number | null;
    manual_check: boolean;
  }[];
}

export interface InterpretedFormulation {
  dosageForm: string;
  quantity: number;
  quantityUnit: string;
  ingredients: InterpretedIngredient[];
  difficultyTags: { tag: string; multiplier: number; reason?: string }[];
  notes: string;
  reasoning: string;
  warnings: string[];
  overallConfidence: "high" | "medium" | "low";
  raw: string; // raw model JSON for debugging / audit
}

const InputSchema = z.object({
  text: z.string().min(3).max(8000),
});

const KNOWN_FORMS = [
  "capsule", "cream", "ointment", "gel", "paste", "lotion",
  "solution", "suspension", "liquid", "drops", "troche", "pessary",
];

const SYSTEM_PROMPT = `You are an experienced Australian compounding pharmacist's assistant.
Given a free-text prescription, return a STRUCTURED JSON draft of the compounded formulation.

Output JSON ONLY, matching EXACTLY this shape (no extra keys, no missing keys):
{
  "dosage_form": "<one of: ${KNOWN_FORMS.join(" | ")}>",
  "total_quantity": <number, total pack quantity to dispense>,
  "quantity_unit": "<one of: mg | g | mL | each>",
  "ingredients": [
    {
      "name": "<ingredient name>",
      "role": "<one of: active | base | excipient>",
      "quantity": <number for the whole pack>,
      "unit": "<one of: mg | g | mL | each>",
      "strength": "<e.g. '5%' or null>",
      "source": "<verbatim <=80 char snippet from prescription, or ''>",
      "low_confidence": <true|false>,
      "inferred": <true|false>,
      "note": "<short note or null>"
    }
  ],
  "difficulty_tags": ["standard" | "three_plus_actives" | "hazardous" | "moulded" | "sterile" | "hard_to_source" | "levigation"],
  "notes": "<optional pharmacist notes>",
  "reasoning": "<1-3 sentences explaining vehicle, strengths, assumptions>",
  "warnings": ["<any safety/ambiguity warnings>"]
}

Rules:
- EVERY top-level field above is REQUIRED. Never omit total_quantity or quantity_unit.
- Identify each ACTIVE ingredient with the prescribed strength/amount.
- Suggest a sensible BASE/vehicle (e.g. "VersaBase Cream", "Aqueous Cream", "Lipoderm", "Glycerin", "Empty capsules size 0") given the dosage form.
- Suggest standard excipients only when clearly required (preservative, suspending agent, sweetener). Mark these inferred=true.
- Compute quantities for the WHOLE pack (not per-dose). Use mg for solid actives, mL for liquids, g for bulk bases, "each" for capsules/pessaries/troches.
- Always include "role" on every ingredient.
- Set low_confidence=true when the prescription is ambiguous.
- Always include "standard" in difficulty_tags if nothing special applies.
- Never invent ingredients not supported by the prescription or standard practice.
- Output JSON ONLY, no prose, no markdown fences.`;

const ResponseSchema = z.object({
  dosage_form: z.string(),
  total_quantity: z.number().positive(),
  quantity_unit: z.string(),
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
    // Some models wrap JSON in code fences; try to recover.
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

/**
 * Models occasionally rename fields (quantity vs total_quantity, unit vs
 * quantity_unit, ingredient_role vs role) or omit role on a base/excipient.
 * Map common aliases and infer safe defaults so validation succeeds.
 */
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
    ingredients: mapped,
  };
}

async function findCandidates(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];
  // Split into salient tokens (drop common excipient noise) and search on the
  // first meaningful word so "Gabapentin powder USP" still matches "Gabapentin".
  const head = trimmed.split(/[\s,()\/]+/)[0];
  const { data } = await supabaseAdmin
    .from("ingredients_master")
    .select("id,ingredient,supplier,pack_size,canonical_unit,unit_cost_ex_gst,manual_check")
    .ilike("ingredient", `%${head}%`)
    .order("unit_cost_ex_gst", { ascending: true, nullsFirst: false })
    .limit(5);
  return data ?? [];
}

export const interpretPrescription = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<InterpretedFormulation> => {
    const draft = await callGateway(data.text);

    const warnings: string[] = [...(draft.warnings ?? [])];

    // Normalise dosage form to known list if possible.
    const dosageForm = KNOWN_FORMS.includes(draft.dosage_form.toLowerCase())
      ? draft.dosage_form.toLowerCase()
      : (warnings.push(`Unrecognised dosage form "${draft.dosage_form}", defaulted to cream`), "cream");

    // Ground every ingredient against ingredients_master.
    const ingredients: InterpretedIngredient[] = await Promise.all(
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
          candidates,
        };
      }),
    );

    const difficultyTags = (draft.difficulty_tags.length ? draft.difficulty_tags : ["standard"])
      .filter((t) => t in DIFFICULTY_MULTIPLIERS)
      .map((t) => ({ tag: t, multiplier: DIFFICULTY_MULTIPLIERS[t] }));
    if (difficultyTags.length === 0) {
      difficultyTags.push({ tag: "standard", multiplier: 1.0 });
    }

    const anyManual = ingredients.some((i) => i.candidates.length === 0 || i.candidates.every((c) => c.manual_check || c.unit_cost_ex_gst == null));
    const anyLow = ingredients.some((i) => i.lowConfidence);
    const overallConfidence: InterpretedFormulation["overallConfidence"] =
      anyManual ? "low" : anyLow ? "medium" : "high";

    return {
      dosageForm,
      quantity: draft.total_quantity,
      quantityUnit: draft.quantity_unit,
      ingredients,
      difficultyTags,
      notes: draft.notes ?? "",
      reasoning: draft.reasoning ?? "",
      warnings,
      overallConfidence,
      raw: draft.__raw,
    };
  });
