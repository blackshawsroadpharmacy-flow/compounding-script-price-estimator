import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brc/Shell";
import { Card, InfoCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { Input, Label, Select, Textarea } from "@/components/brc/Field";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [
      { title: "Product browser — Burke Road Compounding" },
      { name: "description", content: "Manage ingredient and packaging unit costs." },
    ],
  }),
  component: AdminProductsPage,
});

type Tab = "ingredients" | "packaging";

const SUPPLIERS = ["Medisca", "PCCA", "Compounding Chemicals", "Bella Corp"];
const CANONICAL_UNITS = ["mg", "mL", "each", "g"];
const PAGE_SIZE = 25;

interface IngredientRow {
  id: string;
  ingredient: string;
  match_key: string | null;
  supplier: string | null;
  supplier_code: string | null;
  pack_size: string | null;
  pack_price: number | null;
  canonical_unit: string | null;
  normalised_qty: number | null;
  unit_cost_listed: number | null;
  gst_divisor: number | null;
  unit_cost_ex_gst: number | null;
  status: string | null;
  note: string | null;
  manual_check: boolean;
  created_at: string;
}

interface PackagingRow {
  id: string;
  category: string;
  name: string;
  unit_cost_ex_gst: number;
  note: string | null;
  created_at: string;
}

function AdminProductsPage() {
  const [tab, setTab] = useState<Tab>("ingredients");
  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-4xl md:text-5xl text-bark">Product browser</h1>
          <p className="text-text-secondary max-w-2xl">
            Edit ingredient and consumable unit costs directly. Changes take effect
            immediately in the matcher and pricing engine — all prices ex-GST.
          </p>
        </header>

        <div className="flex gap-2">
          {([
            ["ingredients", "Ingredients"],
            ["packaging", "Packaging / consumables"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "rounded-full px-4 py-2 text-sm font-medium border transition-colors " +
                (tab === k
                  ? "bg-bark text-text-inverted border-bark"
                  : "bg-sand-50 text-bark border-sand-150 hover:bg-sand-150")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "ingredients" ? <IngredientsPanel /> : <PackagingPanel />}
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function makeMatchKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SortDir = "asc" | "desc";
function flipSort<T extends string>(active: T | null, dir: SortDir, col: T): { col: T; dir: SortDir } {
  if (active === col) return { col, dir: dir === "asc" ? "desc" : "asc" };
  return { col, dir: "asc" };
}

function SortHeader<T extends string>({
  label, col, sortCol, sortDir, onSort, className,
}: {
  label: string; col: T; sortCol: T | null; sortDir: SortDir;
  onSort: (col: T) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={
        "text-left text-xs font-medium uppercase tracking-wide text-text-secondary hover:text-bark " +
        (className ?? "")
      }
    >
      {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}

// Inline-editable cell wrapper. Saves on blur if the value changed.
function EditableText({
  value, onSave, type = "text", step, placeholder, className,
}: {
  value: string | number | null;
  onSave: (v: string) => void | Promise<void>;
  type?: "text" | "number";
  step?: string;
  placeholder?: string;
  className?: string;
}) {
  const initial = value == null ? "" : String(value);
  const [v, setV] = useState(initial);
  useEffect(() => { setV(initial); }, [initial]);
  return (
    <input
      type={type}
      step={step}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== initial) void onSave(v); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setV(initial); (e.target as HTMLInputElement).blur(); }
      }}
      className={
        "w-full rounded-lg bg-transparent border border-transparent hover:border-sand-150 focus:border-bark/30 focus:bg-sand-50 focus:outline-none px-2 py-1.5 text-sm " +
        (className ?? "")
      }
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Ingredients panel

function IngredientsPanel() {
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<Set<string>>(new Set());
  const [manualOnly, setManualOnly] = useState(false);
  const [sortCol, setSortCol] = useState<keyof IngredientRow | null>("ingredient");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients_master")
      .select("*")
      .order("ingredient", { ascending: true })
      .limit(5000);
    if (error) toast.error(`Failed to load ingredients: ${error.message}`);
    setRows((data ?? []) as IngredientRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter((x) =>
        (x.ingredient ?? "").toLowerCase().includes(q) ||
        (x.supplier_code ?? "").toLowerCase().includes(q),
      );
    }
    if (suppliers.size > 0) r = r.filter((x) => x.supplier && suppliers.has(x.supplier));
    if (manualOnly) r = r.filter((x) => x.manual_check);
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => {
        const av = a[sortCol]; const bv = b[sortCol];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return r;
  }, [rows, search, suppliers, manualOnly, sortCol, sortDir]);

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);

  const patch = async (id: string, patch: Partial<IngredientRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("ingredients_master").update(patch).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); void load(); }
    else toast.success("Saved");
  };

  const recompute = async (row: IngredientRow) => {
    if (row.pack_price == null || !row.normalised_qty) {
      toast.error("Need pack_price and normalised_qty to recompute");
      return;
    }
    const div = row.gst_divisor && row.gst_divisor > 0 ? row.gst_divisor : 1;
    const v = Number(((row.pack_price / div) / row.normalised_qty).toFixed(6));
    await patch(row.id, { unit_cost_ex_gst: v });
  };

  const remove = async (row: IngredientRow) => {
    if (!confirm(`Delete "${row.ingredient}" from ingredients_master? This cannot be undone.`)) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("ingredients_master").delete().eq("id", row.id);
    if (error) { toast.error(`Delete failed: ${error.message}`); void load(); }
    else toast.success("Deleted");
  };

  const toggleSupplier = (s: string) =>
    setSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  const sort = (col: keyof IngredientRow) => {
    const next = flipSort(sortCol, sortDir, col);
    setSortCol(next.col); setSortDir(next.dir);
  };

  const lastUpdated = useMemo(() => {
    const latest = rows.reduce<string | null>((acc, r) => {
      if (!r.created_at) return acc;
      return !acc || r.created_at > acc ? r.created_at : acc;
    }, null);
    return latest;
  }, [rows]);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search ingredient or supplier code…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="!py-2.5 md:max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {SUPPLIERS.map((s) => {
            const on = suppliers.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => { toggleSupplier(s); setPage(0); }}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors " +
                  (on
                    ? "bg-bark text-text-inverted border-bark"
                    : "bg-sand-50 text-bark border-sand-150 hover:bg-sand-150")
                }
              >
                {s}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { setManualOnly((v) => !v); setPage(0); }}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors " +
              (manualOnly
                ? "bg-sunlight text-bark border-sunlight"
                : "bg-sand-50 text-bark border-sand-150 hover:bg-sand-150")
            }
          >
            Needs manual check
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            {filtered.length} of {rows.length} · last updated {fmtDate(lastUpdated)}
          </span>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add ingredient</Button>
        </div>
      </div>

      {showAdd && (
        <AddIngredientForm onClose={() => setShowAdd(false)} onCreated={(row) => { setRows((prev) => [row, ...prev]); setShowAdd(false); }} />
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-sand-150">
              <Th><SortHeader label="Ingredient" col="ingredient" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th><SortHeader label="Supplier" col="supplier" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th><SortHeader label="Pack size" col="pack_size" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th className="text-right"><SortHeader label="Pack price" col="pack_price" sortCol={sortCol} sortDir={sortDir} onSort={sort} className="text-right w-full" /></Th>
              <Th><SortHeader label="Unit" col="canonical_unit" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th className="text-right"><SortHeader label="Unit cost ex-GST" col="unit_cost_ex_gst" sortCol={sortCol} sortDir={sortDir} onSort={sort} className="text-right w-full" /></Th>
              <Th>Manual</Th>
              <Th>Note</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-3 py-6 text-text-tertiary text-sm">Loading…</td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-text-tertiary text-sm">No rows match.</td></tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.id} className="border-b border-sand-150 hover:bg-sand-50/60 align-top">
                <Td>
                  <EditableText value={row.ingredient} onSave={(v) => patch(row.id, { ingredient: v, match_key: row.match_key || makeMatchKey(v) })} className="font-medium text-bark" />
                  {row.supplier_code && <div className="text-xs text-text-tertiary px-2">code {row.supplier_code}</div>}
                </Td>
                <Td>
                  <select
                    value={row.supplier ?? ""}
                    onChange={(e) => patch(row.id, { supplier: e.target.value || null })}
                    className="w-full rounded-lg bg-transparent border border-transparent hover:border-sand-150 focus:border-bark/30 focus:bg-sand-50 focus:outline-none px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
                    {row.supplier && !SUPPLIERS.includes(row.supplier) && <option value={row.supplier}>{row.supplier}</option>}
                  </select>
                </Td>
                <Td><EditableText value={row.pack_size} onSave={(v) => patch(row.id, { pack_size: v || null })} /></Td>
                <Td className="text-right">
                  <EditableText
                    type="number" step="0.01" value={row.pack_price}
                    onSave={(v) => patch(row.id, { pack_price: v === "" ? null : Number(v) })}
                    className="text-right tabular-nums"
                  />
                </Td>
                <Td>
                  <select
                    value={row.canonical_unit ?? ""}
                    onChange={(e) => patch(row.id, { canonical_unit: e.target.value || null })}
                    className="w-full rounded-lg bg-transparent border border-transparent hover:border-sand-150 focus:border-bark/30 focus:bg-sand-50 focus:outline-none px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {CANONICAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Td>
                <Td className="text-right">
                  <EditableText
                    type="number" step="0.000001" value={row.unit_cost_ex_gst}
                    onSave={(v) => patch(row.id, { unit_cost_ex_gst: v === "" ? null : Number(v) })}
                    className="text-right tabular-nums"
                  />
                  {row.pack_price != null && row.normalised_qty != null && (
                    <button
                      type="button"
                      onClick={() => recompute(row)}
                      className="text-[10px] uppercase tracking-wide text-text-tertiary hover:text-bark px-2"
                      title="Recompute = (pack_price ÷ gst_divisor) ÷ normalised_qty"
                    >
                      Recompute
                    </button>
                  )}
                </Td>
                <Td>
                  <label className="inline-flex items-center gap-2 px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={row.manual_check}
                      onChange={(e) => patch(row.id, { manual_check: e.target.checked })}
                      className="h-4 w-4 rounded border-sand-150"
                    />
                    {row.manual_check && <Badge tone="manual">flag</Badge>}
                  </label>
                </Td>
                <Td><EditableText value={row.note} onSave={(v) => patch(row.id, { note: v || null })} placeholder="—" /></Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    className="text-xs text-text-tertiary hover:text-[#7a2218] px-2 py-1"
                  >
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </Card>
  );
}

function AddIngredientForm({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (row: IngredientRow) => void }) {
  const [form, setForm] = useState({
    ingredient: "",
    supplier: "Medisca",
    pack_size: "",
    pack_price: "",
    canonical_unit: "mg",
    unit_cost_ex_gst: "",
    manual_check: false,
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const submit = async () => {
    if (!form.ingredient.trim()) { toast.error("Ingredient name required"); return; }
    setSaving(true);
    const payload = {
      ingredient: form.ingredient.trim(),
      match_key: makeMatchKey(form.ingredient),
      supplier: form.supplier || null,
      pack_size: form.pack_size || null,
      pack_price: form.pack_price ? Number(form.pack_price) : null,
      canonical_unit: form.canonical_unit || null,
      unit_cost_ex_gst: form.unit_cost_ex_gst ? Number(form.unit_cost_ex_gst) : null,
      manual_check: form.manual_check,
      note: form.note || null,
      status: "manual",
    };
    const { data, error } = await supabase
      .from("ingredients_master").insert(payload).select("*").single();
    setSaving(false);
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    toast.success("Ingredient added");
    onCreated(data as IngredientRow);
  };

  return (
    <InfoCard className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl">New ingredient</h3>
        <button type="button" onClick={onClose} className="text-xs text-text-tertiary hover:text-bark">Close</button>
      </div>
      <div className="grid md:grid-cols-12 gap-3">
        <Field label="Ingredient" span={5}>
          <Input value={form.ingredient} onChange={(e) => set({ ingredient: e.target.value })} placeholder="e.g. Gabapentin" />
        </Field>
        <Field label="Supplier" span={3}>
          <Select value={form.supplier} onChange={(e) => set({ supplier: e.target.value })}>
            {SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Pack size" span={2}>
          <Input value={form.pack_size} onChange={(e) => set({ pack_size: e.target.value })} placeholder="100 g" />
        </Field>
        <Field label="Pack price" span={2}>
          <Input type="number" step="0.01" value={form.pack_price} onChange={(e) => set({ pack_price: e.target.value })} />
        </Field>
        <Field label="Canonical unit" span={2}>
          <Select value={form.canonical_unit} onChange={(e) => set({ canonical_unit: e.target.value })}>
            {CANONICAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Unit cost ex-GST" span={3}>
          <Input type="number" step="0.000001" value={form.unit_cost_ex_gst} onChange={(e) => set({ unit_cost_ex_gst: e.target.value })} />
        </Field>
        <Field label="Note" span={7}>
          <Input value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        <div className="md:col-span-12 flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox" checked={form.manual_check}
              onChange={(e) => set({ manual_check: e.target.checked })}
              className="h-4 w-4 rounded border-sand-150"
            />
            Needs manual check
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add ingredient"}</Button>
          </div>
        </div>
      </div>
    </InfoCard>
  );
}

const SPAN_CLASS: Record<number, string> = {
  2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4",
  5: "md:col-span-5", 6: "md:col-span-6", 7: "md:col-span-7",
  8: "md:col-span-8", 12: "md:col-span-12",
};
function Field({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <div className={SPAN_CLASS[span] ?? "md:col-span-4"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────────────
// Packaging panel

function PackagingPanel() {
  const [rows, setRows] = useState<PackagingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [sortCol, setSortCol] = useState<keyof PackagingRow | null>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("packaging_catalogue")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .limit(5000);
    if (error) toast.error(`Failed to load packaging: ${error.message}`);
    setRows((data ?? []) as PackagingRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows;
    if (q) r = r.filter((x) => (x.name ?? "").toLowerCase().includes(q));
    if (category) r = r.filter((x) => x.category === category);
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => {
        const av = a[sortCol]; const bv = b[sortCol];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return r;
  }, [rows, search, category, sortCol, sortDir]);

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);

  const patch = async (id: string, patch: Partial<PackagingRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("packaging_catalogue").update(patch).eq("id", id);
    if (error) { toast.error(`Save failed: ${error.message}`); void load(); }
    else toast.success("Saved");
  };

  const remove = async (row: PackagingRow) => {
    if (!confirm(`Delete "${row.name}" from packaging_catalogue?`)) return;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("packaging_catalogue").delete().eq("id", row.id);
    if (error) { toast.error(`Delete failed: ${error.message}`); void load(); }
    else toast.success("Deleted");
  };

  const sort = (col: keyof PackagingRow) => {
    const next = flipSort(sortCol, sortDir, col);
    setSortCol(next.col); setSortDir(next.dir);
  };

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search packaging…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="!py-2.5 md:max-w-md"
        />
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }} className="!py-2.5 md:max-w-xs">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            {filtered.length} of {rows.length}
          </span>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Add packaging</Button>
        </div>
      </div>

      {showAdd && (
        <AddPackagingForm
          categories={categories}
          onClose={() => setShowAdd(false)}
          onCreated={(row) => { setRows((prev) => [row, ...prev]); setShowAdd(false); }}
        />
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-sand-150">
              <Th><SortHeader label="Category" col="category" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th><SortHeader label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={sort} /></Th>
              <Th className="text-right"><SortHeader label="Unit cost ex-GST" col="unit_cost_ex_gst" sortCol={sortCol} sortDir={sortDir} onSort={sort} className="text-right w-full" /></Th>
              <Th>Note</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-3 py-6 text-text-tertiary text-sm">Loading…</td></tr>}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-text-tertiary text-sm">No rows match.</td></tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.id} className="border-b border-sand-150 hover:bg-sand-50/60">
                <Td><EditableText value={row.category} onSave={(v) => patch(row.id, { category: v })} /></Td>
                <Td><EditableText value={row.name} onSave={(v) => patch(row.id, { name: v })} className="font-medium text-bark" /></Td>
                <Td className="text-right">
                  <EditableText
                    type="number" step="0.0001" value={row.unit_cost_ex_gst}
                    onSave={(v) => patch(row.id, { unit_cost_ex_gst: v === "" ? 0 : Number(v) })}
                    className="text-right tabular-nums"
                  />
                </Td>
                <Td><EditableText value={row.note} onSave={(v) => patch(row.id, { note: v || null })} placeholder="—" /></Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    className="text-xs text-text-tertiary hover:text-[#7a2218] px-2 py-1"
                  >
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </Card>
  );
}

function AddPackagingForm({
  categories, onClose, onCreated,
}: { categories: string[]; onClose: () => void; onCreated: (row: PackagingRow) => void }) {
  const [form, setForm] = useState({
    category: categories[0] ?? "container",
    name: "",
    unit_cost_ex_gst: "0",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("packaging_catalogue")
      .insert({
        category: form.category.trim() || "container",
        name: form.name.trim(),
        unit_cost_ex_gst: Number(form.unit_cost_ex_gst || 0),
        note: form.note || null,
      })
      .select("*").single();
    setSaving(false);
    if (error) { toast.error(`Add failed: ${error.message}`); return; }
    toast.success("Packaging added");
    onCreated(data as PackagingRow);
  };

  return (
    <InfoCard className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl">New packaging item</h3>
        <button type="button" onClick={onClose} className="text-xs text-text-tertiary hover:text-bark">Close</button>
      </div>
      <div className="grid md:grid-cols-12 gap-3">
        <Field label="Category" span={3}>
          <Input list="pkg-cat" value={form.category} onChange={(e) => set({ category: e.target.value })} />
          <datalist id="pkg-cat">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Name" span={5}>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. 50 g amber jar" />
        </Field>
        <Field label="Unit cost ex-GST" span={2}>
          <Input type="number" step="0.0001" value={form.unit_cost_ex_gst} onChange={(e) => set({ unit_cost_ex_gst: e.target.value })} />
        </Field>
        <Field label="Note" span={2}>
          <Input value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        <div className="md:col-span-12 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add packaging"}</Button>
        </div>
      </div>
    </InfoCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Table primitives + pagination

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={"px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary " + (className ?? "")}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={"px-1 py-1 text-sm text-bark align-middle " + (className ?? "")}>{children}</td>;
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button variant="secondary" size="sm" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}>Prev</Button>
      <span className="text-text-tertiary tabular-nums">Page {page + 1} of {pageCount}</span>
      <Button variant="secondary" size="sm" onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>Next</Button>
    </div>
  );
}
