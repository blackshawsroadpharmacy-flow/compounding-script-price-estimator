/**
 * Formulation library helpers.
 *
 * A formulation is a saved snapshot of a quote draft's bill of materials,
 * dosage form, quantity, difficulty tags and notes. Loading one into a quote
 * skips the AI interpretation step.
 */
import { supabase } from "@/integrations/supabase/client";
import type { BomLine, PackagingLine } from "@/lib/pricing";
import { quoteStore, type FormulationDraft } from "@/state/quote";

export interface FormulationRow {
  id: string;
  name: string;
  dosage_form: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  bom: BomLine[];
  packaging: PackagingLine[];
  difficulty_tags: { tag: string; multiplier: number }[];
  default_make_minutes: number | null;
  notes: string | null;
  source: "pharmacist" | "history" | "pdf";
  times_used: number;
  last_used_at: string | null;
  created_at: string;
}

export interface FormulationSaveInput {
  name: string;
  draft: Pick<
    FormulationDraft,
    "dosageForm" | "quantity" | "quantityUnit" | "bom" | "packaging" | "difficultyTags" | "makeMinutes" | "notes"
  >;
  source?: "pharmacist" | "history" | "pdf";
}

export function activeIngredientSummary(bom: BomLine[]): string {
  const actives = bom.filter((l) => l.role === "active").map((l) => l.name).filter(Boolean);
  if (actives.length === 0) return "—";
  if (actives.length <= 3) return actives.join(", ");
  return actives.slice(0, 3).join(", ") + ` +${actives.length - 3}`;
}

export async function listFormulations(opts: { search?: string; form?: string } = {}) {
  let q = supabase
    .from("formulations")
    .select("*")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (opts.form && opts.form !== "all") q = q.eq("dosage_form", opts.form);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${s}%,dosage_form.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as FormulationRow[];
}

export async function findSimilarFormulation(name: string, dosageForm: string) {
  const { data } = await supabase
    .from("formulations")
    .select("id,name,dosage_form")
    .ilike("name", name.trim())
    .eq("dosage_form", dosageForm)
    .limit(1);
  return (data?.[0] as { id: string; name: string; dosage_form: string } | undefined) ?? null;
}

export async function saveFormulation(input: FormulationSaveInput) {
  const { draft, name, source = "pharmacist" } = input;
  const payload = {
    name: name.trim(),
    dosage_form: draft.dosageForm,
    quantity: draft.quantity,
    quantity_unit: draft.quantityUnit,
    bom: JSON.parse(JSON.stringify(draft.bom)),
    packaging: JSON.parse(JSON.stringify(draft.packaging)),
    difficulty_tags: JSON.parse(JSON.stringify(draft.difficultyTags)),
    default_make_minutes: draft.makeMinutes,
    notes: draft.notes,
    source,
  };
  const { data, error } = await supabase.from("formulations").insert(payload).select("id").single();
  if (error) throw error;
  return data!.id as string;
}

export async function updateFormulation(id: string, input: FormulationSaveInput) {
  const { draft, name } = input;
  const { error } = await supabase
    .from("formulations")
    .update({
      name: name.trim(),
      dosage_form: draft.dosageForm,
      quantity: draft.quantity,
      quantity_unit: draft.quantityUnit,
      bom: JSON.parse(JSON.stringify(draft.bom)),
      packaging: JSON.parse(JSON.stringify(draft.packaging)),
      difficulty_tags: JSON.parse(JSON.stringify(draft.difficultyTags)),
      default_make_minutes: draft.makeMinutes,
      notes: draft.notes,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function loadFormulationIntoDraft(row: FormulationRow, opts: { jumpToStep?: number } = {}) {
  const draft: FormulationDraft = {
    prescriptionText: row.name,
    dosageForm: row.dosage_form ?? "cream",
    quantity: Number(row.quantity ?? 0),
    quantityUnit: row.quantity_unit ?? "g",
    taxable: false,
    makeMinutes: Number(row.default_make_minutes ?? 25),
    bom: (row.bom ?? []).map((l) => ({ ...l, id: l.id || crypto.randomUUID() })),
    packaging: row.packaging ?? [],
    difficultyTags:
      row.difficulty_tags && row.difficulty_tags.length > 0
        ? row.difficulty_tags
        : [{ tag: "standard", multiplier: 1.0 }],
    notes: row.notes ?? "",
    aiInterpreted: false,
  };
  quoteStore.setState({ draft, step: opts.jumpToStep ?? 3 });
  // Fire-and-forget usage bump.
  void supabase
    .from("formulations")
    .update({ times_used: row.times_used + 1, last_used_at: new Date().toISOString() })
    .eq("id", row.id);
}

/**
 * Seed starter formulations from price_history. Groups by normalised
 * description + dosage_form and inserts one row per distinct preparation that
 * is not already present (matched by name + form). Returns the number created.
 */
export async function seedFormulationsFromHistory(): Promise<{ created: number; skipped: number }> {
  const { data: history, error } = await supabase
    .from("price_history")
    .select("description,dosage_form,quantity,price,dispensed_date")
    .not("description", "is", null)
    .limit(5000);
  if (error) throw error;

  type Group = {
    name: string;
    dosage_form: string;
    quantity: number | null;
    times: number;
    last_used: string | null;
  };
  const groups = new Map<string, Group>();
  for (const r of history ?? []) {
    const desc = (r.description ?? "").trim();
    if (!desc) continue;
    const form = (r.dosage_form ?? "").trim().toLowerCase() || inferForm(desc);
    // Normalise: collapse whitespace, strip trailing "x N" qty suffix
    const norm = desc
      .replace(/\s+/g, " ")
      .replace(/\s*[x×]\s*\d+\s*$/i, "")
      .trim();
    const key = `${norm.toLowerCase()}::${form}`;
    const g = groups.get(key);
    const date = (r.dispensed_date as string | null) ?? null;
    if (g) {
      g.times += 1;
      if (date && (!g.last_used || date > g.last_used)) g.last_used = date;
    } else {
      groups.set(key, { name: norm, dosage_form: form, quantity: r.quantity as number | null, times: 1, last_used: date });
    }
  }

  // Pull existing names to avoid duplicates
  const { data: existing } = await supabase.from("formulations").select("name,dosage_form");
  const have = new Set((existing ?? []).map((e: { name: string; dosage_form: string | null }) =>
    `${e.name.toLowerCase()}::${(e.dosage_form ?? "").toLowerCase()}`,
  ));

  const rows = Array.from(groups.values())
    .filter((g) => !have.has(`${g.name.toLowerCase()}::${g.dosage_form.toLowerCase()}`))
    .map((g) => ({
      name: g.name,
      dosage_form: g.dosage_form || null,
      quantity: g.quantity,
      quantity_unit: defaultUnitForForm(g.dosage_form),
      bom: [],
      packaging: [],
      difficulty_tags: [{ tag: "standard", multiplier: 1.0 }],
      default_make_minutes: defaultMakeMinutes(g.dosage_form),
      notes: `Derived from price history (${g.times} dispense${g.times === 1 ? "" : "s"}).`,
      source: "history" as const,
      times_used: g.times,
      last_used_at: g.last_used ? new Date(g.last_used).toISOString() : null,
    }));

  if (rows.length === 0) return { created: 0, skipped: groups.size };

  // Insert in chunks of 200 to keep payload reasonable
  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error: insErr, count } = await supabase
      .from("formulations")
      .insert(chunk, { count: "exact" });
    if (insErr) throw insErr;
    created += count ?? chunk.length;
  }
  return { created, skipped: groups.size - rows.length };
}

function inferForm(desc: string): string {
  const s = desc.toLowerCase();
  if (/\bcapsule|cap\b/.test(s)) return "capsule";
  if (/\bcream\b/.test(s)) return "cream";
  if (/\bointment|oint\b/.test(s)) return "ointment";
  if (/\bgel\b/.test(s)) return "gel";
  if (/\blotion\b/.test(s)) return "lotion";
  if (/\btroche|lozenge\b/.test(s)) return "troche";
  if (/\bpessary|suppository\b/.test(s)) return "pessary";
  if (/\bsolution|liquid|suspension|drops\b/.test(s)) return "solution";
  return "cream";
}

function defaultUnitForForm(form: string) {
  if (["capsule", "troche", "pessary"].includes(form)) return "each";
  if (["solution", "suspension", "liquid", "drops", "lotion"].includes(form)) return "mL";
  return "g";
}

function defaultMakeMinutes(form: string) {
  if (form === "capsule") return 35;
  if (["troche", "pessary"].includes(form)) return 40;
  if (["solution", "suspension", "liquid", "drops"].includes(form)) return 20;
  return 25;
}
