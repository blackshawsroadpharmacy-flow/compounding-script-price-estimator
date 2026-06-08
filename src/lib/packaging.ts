/**
 * Packaging resolution.
 *
 * Given a dosage form and the final pack quantity, resolve the default
 * packaging set (container + closure + label + optional device) from
 * `form_rules.default_packaging` / `default_device_key` and the
 * `packaging_catalogue` rows tagged with stable `pack_key`s.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PackagingLine } from "@/lib/pricing";
import { quoteStore } from "@/state/quote";

export interface CatalogueRow {
  id: string;
  category: string;
  name: string;
  unit_cost_ex_gst: number;
  pack_key: string | null;
  size_value: number | null;
  size_unit: string | null;
  is_default: boolean;
  note: string | null;
}

interface FormRule {
  dosage_form: string;
  default_packaging: string | null;
  default_device_key: string | null;
}

// Local cache to avoid refetching on every form change. Cleared on full reload.
let cacheCatalogue: CatalogueRow[] | null = null;
let cacheRules: Map<string, FormRule> | null = null;

export function clearPackagingCache() {
  cacheCatalogue = null;
  cacheRules = null;
}

async function loadCatalogue(): Promise<CatalogueRow[]> {
  if (cacheCatalogue) return cacheCatalogue;
  const { data, error } = await supabase
    .from("packaging_catalogue")
    .select("id,category,name,unit_cost_ex_gst,pack_key,size_value,size_unit,is_default,note");
  if (error) throw error;
  cacheCatalogue = (data ?? []) as unknown as CatalogueRow[];
  return cacheCatalogue;
}

async function loadFormRules(): Promise<Map<string, FormRule>> {
  if (cacheRules) return cacheRules;
  const { data, error } = await supabase
    .from("form_rules")
    .select("dosage_form,default_packaging,default_device_key");
  if (error) throw error;
  const map = new Map<string, FormRule>();
  for (const r of (data ?? []) as unknown as FormRule[]) map.set(r.dosage_form, r);
  cacheRules = map;
  return map;
}

export async function searchPackaging(query: string): Promise<CatalogueRow[]> {
  const cat = await loadCatalogue();
  const q = query.trim().toLowerCase();
  if (!q) return cat.slice(0, 25);
  return cat
    .filter((r) => r.name.toLowerCase().includes(q) || (r.pack_key ?? "").includes(q))
    .slice(0, 25);
}

function pickSized(rows: CatalogueRow[], targetQty: number): CatalogueRow | null {
  if (rows.length === 0) return null;
  // Smallest size >= target; otherwise the largest available.
  const sorted = [...rows].sort((a, b) => (a.size_value ?? 0) - (b.size_value ?? 0));
  const fit = sorted.find((r) => (r.size_value ?? 0) >= targetQty);
  return fit ?? sorted[sorted.length - 1];
}

function toLine(row: CatalogueRow, quantity = 1): PackagingLine {
  return {
    id: crypto.randomUUID(),
    name: row.name,
    category: row.category,
    unitCostExGst: Number(row.unit_cost_ex_gst ?? 0),
    quantity,
  };
}

export interface ResolvedPackaging {
  lines: PackagingLine[];
  missing: string[]; // pack_keys with no catalogue row
}

/**
 * Resolve the default packaging set for a form + pack quantity.
 * Returns one container, one closure (default), one label (default), plus
 * a device if the form declares one. `missing` lists keys that had no
 * matching catalogue row so callers can surface a warning.
 */
export async function resolveDefaultPackaging(
  dosageForm: string,
  packQuantity: number,
): Promise<ResolvedPackaging> {
  const [cat, rules] = await Promise.all([loadCatalogue(), loadFormRules()]);
  const rule = rules.get(dosageForm);
  const missing: string[] = [];
  const lines: PackagingLine[] = [];

  // Container
  const containerKey = rule?.default_packaging;
  if (containerKey) {
    const matching = cat.filter((r) => r.pack_key === containerKey);
    const chosen = matching.some((r) => r.size_value != null)
      ? pickSized(matching, packQuantity)
      : matching[0] ?? null;
    if (chosen) lines.push(toLine(chosen, 1));
    else missing.push(containerKey);
  }

  // Default closure + label
  const closure = cat.find((r) => r.category === "closure" && r.is_default);
  if (closure) lines.push(toLine(closure, 1));
  else missing.push("closure:default");

  const label = cat.find((r) => r.category === "label" && r.is_default);
  if (label) lines.push(toLine(label, 1));
  else missing.push("label:default");

  // Optional device
  if (rule?.default_device_key) {
    const device = cat.find((r) => r.pack_key === rule.default_device_key);
    if (device) lines.push(toLine(device, 1));
    else missing.push(rule.default_device_key);
  }

  return { lines, missing };
}

/**
 * True when the current packaging set looks pharmacist-untouched (empty, or
 * exactly the auto-populated default for the previous form). We only ever
 * replace packaging that the pharmacist hasn't customised.
 */
export function isAutoPackaging(
  current: PackagingLine[],
  marker: string | null,
  currentMarker: string | null,
): boolean {
  if (current.length === 0) return true;
  if (!marker || !currentMarker) return false;
  return marker === currentMarker;
}

function markerFor(form: string, qty: number): string {
  return `${form}|${qty}`;
}

/**
 * Apply default packaging for the current form+quantity if the pharmacist
 * has not customised packaging. Safe to call repeatedly; no-op when the
 * pharmacist has manual edits (marker cleared).
 */
export async function applyDefaultPackaging(form: string, quantity: number) {
  const state = quoteStore.getState().draft;
  const currentMarker = markerFor(form, quantity);
  const isAuto = state.packaging.length === 0 || state.packagingAutoMarker !== null;
  if (!isAuto) return { applied: false, missing: [] as string[] };
  if (state.packagingAutoMarker === currentMarker && state.packaging.length > 0) {
    return { applied: false, missing: [] as string[] };
  }
  const { lines, missing } = await resolveDefaultPackaging(form, quantity);
  quoteStore.setState({
    draft: { ...state, packaging: lines, packagingAutoMarker: currentMarker },
  });
  return { applied: true, missing };
}

export function markPackagingManual() {
  const state = quoteStore.getState();
  if (state.draft.packagingAutoMarker === null) return;
  state.update({ packagingAutoMarker: null });
}
