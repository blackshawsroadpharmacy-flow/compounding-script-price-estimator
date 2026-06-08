import { useEffect, useState } from "react";
import { Card, InfoCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge, type BadgeTone } from "@/components/brc/Badge";
import { Input, Label, Select } from "@/components/brc/Field";
import { useQuote } from "@/state/quote";
import type { BomLine, IngredientRole, PackagingLine } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import {
  applyDefaultPackaging,
  markPackagingManual,
  searchPackaging,
  type CatalogueRow,
} from "@/lib/packaging";

interface SupplierMatch {
  id: string;
  ingredient: string;
  supplier: string;
  pack_size: string | null;
  canonical_unit: string | null;
  unit_cost_ex_gst: number | null;
  manual_check: boolean;
}

const FORMS = [
  "capsule","cream","ointment","gel","paste","lotion",
  "solution","suspension","liquid","drops","troche","pessary",
];

const DIFFICULTY_TAGS = [
  { tag: "standard", multiplier: 1.0, label: "Standard" },
  { tag: "three_plus_actives", multiplier: 1.15, label: "3+ actives" },
  { tag: "hazardous", multiplier: 1.25, label: "Hazardous / hormone" },
  { tag: "moulded", multiplier: 1.20, label: "Moulded dose form" },
  { tag: "sterile", multiplier: 1.50, label: "Sterile / ophthalmic" },
  { tag: "hard_to_source", multiplier: 1.10, label: "Hard-to-source API" },
  { tag: "levigation", multiplier: 1.15, label: "Levigation" },
];

function newLine(role: IngredientRole = "active"): BomLine {
  return {
    id: crypto.randomUUID(),
    name: "",
    role,
    quantity: 0,
    unit: role === "active" ? "mg" : role === "base" ? "g" : "each",
    unitCostExGst: null,
    matchedIngredientId: null,
    matchedSupplier: null,
    wastagePct: 0,
    manualPriceNeeded: true,
  };
}

function badgeFor(line: BomLine): { tone: BadgeTone; label: string } | null {
  if (line.manualPriceNeeded || line.unitCostExGst == null)
    return { tone: "manual", label: "Manual price needed" };
  if (line.lowConfidence) return { tone: "lowConfidence", label: "Low confidence" };
  if (line.matchedIngredientId) return { tone: "supplier", label: "Supplier matched" };
  return null;
}

export function StepEdit({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const draft = useQuote((s) => s.draft);
  const update = useQuote((s) => s.update);

  const setBom = (bom: BomLine[]) => update({ bom });
  const patchLine = (id: string, patch: Partial<BomLine>) =>
    setBom(draft.bom.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setBom(draft.bom.filter((l) => l.id !== id));

  // Auto-populate default packaging when the form or pack quantity changes,
  // unless the pharmacist has hand-edited packaging (marker cleared).
  const [missingPackKeys, setMissingPackKeys] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void applyDefaultPackaging(draft.dosageForm, draft.quantity).then((r) => {
      if (!cancelled && r.applied) setMissingPackKeys(r.missing);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.dosageForm, draft.quantity]);

  const setPackaging = (next: PackagingLine[]) => {
    markPackagingManual();
    update({ packaging: next });
  };
  const patchPackaging = (id: string, patch: Partial<PackagingLine>) =>
    setPackaging(draft.packaging.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removePackaging = (id: string) =>
    setPackaging(draft.packaging.filter((l) => l.id !== id));
  const addPackagingRow = (row: CatalogueRow) =>
    setPackaging([
      ...draft.packaging,
      {
        id: crypto.randomUUID(),
        name: row.name,
        category: row.category,
        unitCostExGst: Number(row.unit_cost_ex_gst ?? 0),
        quantity: 1,
      },
    ]);

  const packagingSubtotal = draft.packaging.reduce(
    (acc, p) => acc + p.unitCostExGst * p.quantity,
    0,
  );

  return (
    <Card className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl md:text-4xl">Pharmacist edit</h2>
        <p className="text-text-secondary leading-relaxed max-w-2xl">
          Confirm the dosage form and quantity, then build the bill of materials.
          Match each line to a supplier so the unit cost flows through.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Dosage form</Label>
          <Select
            value={draft.dosageForm}
            onChange={(e) => update({ dosageForm: e.target.value })}
          >
            {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        <div>
          <Label>Final pack quantity</Label>
          <Input
            type="number"
            value={draft.quantity}
            onChange={(e) => update({ quantity: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Unit</Label>
          <Select
            value={draft.quantityUnit}
            onChange={(e) => update({ quantityUnit: e.target.value })}
          >
            {["g", "mL", "each"].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl">Bill of materials</h3>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBom([...draft.bom, newLine("active")])}>
              + Active
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBom([...draft.bom, newLine("base")])}>
              + Base
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBom([...draft.bom, newLine("excipient")])}>
              + Excipient
            </Button>
          </div>
        </div>

        {draft.bom.length === 0 ? (
          <InfoCard className="text-text-secondary text-sm">
            No ingredients yet. Add an active to begin building the formulation.
          </InfoCard>
        ) : (
          <div className="space-y-3">
            {draft.bom.map((line) => (
              <BomLineRow
                key={line.id}
                line={line}
                onChange={(patch) => patchLine(line.id, patch)}
                onRemove={() => removeLine(line.id)}
              />
            ))}
          </div>
        )}
      </div>

      <PackagingSection
        lines={draft.packaging}
        subtotal={packagingSubtotal}
        missingKeys={missingPackKeys}
        isCapsuleForm={draft.dosageForm === "capsule"}
        onPatch={patchPackaging}
        onRemove={removePackaging}
        onAdd={addPackagingRow}
      />



      <div className="space-y-3">
        <Label>Difficulty tags</Label>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_TAGS.map((t) => {
            const active = draft.difficultyTags.some((x) => x.tag === t.tag);
            return (
              <button
                key={t.tag}
                type="button"
                onClick={() => {
                  const next = active
                    ? draft.difficultyTags.filter((x) => x.tag !== t.tag)
                    : [...draft.difficultyTags, { tag: t.tag, multiplier: t.multiplier }];
                  update({ difficultyTags: next.length ? next : [{ tag: "standard", multiplier: 1 }] });
                }}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors " +
                  (active
                    ? "bg-bark text-text-inverted border-bark"
                    : "bg-sand-50 text-bark border-sand-150 hover:bg-sand-150")
                }
              >
                {t.label} × {t.multiplier.toFixed(2)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Make-time (minutes)</Label>
          <Input
            type="number"
            value={draft.makeMinutes}
            onChange={(e) => update({ makeMinutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Markup override</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="default 1.236"
            value={draft.markupOverride ?? ""}
            onChange={(e) =>
              update({ markupOverride: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={draft.taxable}
              onChange={(e) => update({ taxable: e.target.checked })}
              className="h-4 w-4 rounded border-sand-150"
            />
            Apply GST (taxable item)
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button
          variant="primary"
          disabled={draft.bom.length === 0}
          onClick={onNext}
        >
          Calculate price
        </Button>
      </div>
    </Card>
  );
}

function BomLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: BomLine;
  onChange: (p: Partial<BomLine>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(line.name);
  const [matches, setMatches] = useState<SupplierMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const b = badgeFor(line);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("ingredients_master")
      .select("id,ingredient,supplier,pack_size,canonical_unit,unit_cost_ex_gst,manual_check")
      .ilike("ingredient", `%${query.trim()}%`)
      .order("unit_cost_ex_gst", { ascending: true, nullsFirst: false })
      .limit(8);
    setMatches((data ?? []) as SupplierMatch[]);
    setSearching(false);
  };

  const pick = (m: SupplierMatch) => {
    onChange({
      name: line.name || m.ingredient,
      matchedIngredientId: m.id,
      matchedSupplier: m.supplier,
      unitCostExGst: m.manual_check ? null : Number(m.unit_cost_ex_gst ?? 0),
      manualPriceNeeded: m.manual_check || m.unit_cost_ex_gst == null,
      unit: m.canonical_unit || line.unit,
    });
    setMatches([]);
  };

  return (
    <div className="rounded-2xl bg-sand-50 border border-sand-150 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {line.role}
        </span>
        {b && <Badge tone={b.tone}>{b.label}</Badge>}
        {line.matchedSupplier && (
          <span className="text-xs text-text-tertiary">from {line.matchedSupplier}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-text-tertiary hover:text-bark"
        >
          Remove
        </button>
      </div>

      <div className="grid md:grid-cols-12 gap-3">
        <div className="md:col-span-5">
          <Label>Ingredient</Label>
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder="e.g. Gabapentin"
              onChange={(e) => {
                setQuery(e.target.value);
                onChange({ name: e.target.value });
              }}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button type="button" variant="secondary" size="sm" onClick={search}>
              {searching ? "…" : "Match"}
            </Button>
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Quantity</Label>
          <Input
            type="number"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Unit</Label>
          <Select value={line.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            {["mg","g","mL","each"].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Unit cost (ex-GST)</Label>
          <Input
            type="number"
            step="0.0001"
            placeholder="—"
            value={line.unitCostExGst ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              onChange({ unitCostExGst: v, manualPriceNeeded: v == null });
            }}
          />
        </div>
        <div className="md:col-span-1">
          <Label>Waste %</Label>
          <Input
            type="number"
            value={line.wastagePct ?? 0}
            onChange={(e) => onChange({ wastagePct: Number(e.target.value) })}
          />
        </div>
      </div>

      {matches.length > 0 && (
        <div className="rounded-xl bg-sand-25 border border-sand-150 divide-y divide-sand-150">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m)}
              className="w-full text-left px-3 py-2 hover:bg-sand-100 flex items-center justify-between gap-3"
            >
              <span className="text-sm text-bark truncate">{m.ingredient}</span>
              <span className="text-xs text-text-secondary flex items-center gap-3">
                <span>{m.supplier}</span>
                <span>{m.pack_size}</span>
                <span className="tabular-nums">
                  {m.manual_check || m.unit_cost_ex_gst == null
                    ? "manual"
                    : `$${Number(m.unit_cost_ex_gst).toFixed(4)}/${m.canonical_unit}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PackagingSection({
  lines,
  subtotal,
  missingKeys,
  isCapsuleForm,
  onPatch,
  onRemove,
  onAdd,
}: {
  lines: PackagingLine[];
  subtotal: number;
  missingKeys: string[];
  isCapsuleForm: boolean;
  onPatch: (id: string, patch: Partial<PackagingLine>) => void;
  onRemove: (id: string) => void;
  onAdd: (row: CatalogueRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CatalogueRow[]>([]);
  const [open, setOpen] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length === 0) {
      setMatches([]);
      return;
    }
    setMatches(await searchPackaging(q));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl">Packaging &amp; consumables</h3>
          <p className="text-xs text-text-tertiary mt-1 max-w-xl">
            Outer container + closure + label{isCapsuleForm ? " — the empty capsule shells already sit in the BOM and scale per capsule, so the two don't overlap" : ""}.
          </p>
        </div>
        <div className="text-sm text-text-secondary">
          Subtotal <span className="text-bark font-medium tabular-nums">${subtotal.toFixed(2)}</span>
        </div>
      </div>

      {missingKeys.length > 0 && (
        <InfoCard className="text-sm">
          No catalogue rows for: <span className="text-bark">{missingKeys.join(", ")}</span>. Add one in the Products admin or pick another below.
        </InfoCard>
      )}

      {lines.length === 0 ? (
        <InfoCard className="text-text-secondary text-sm">
          No packaging yet. Default packaging is normally added when you set the dosage form.
        </InfoCard>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.id}
              className="rounded-2xl bg-sand-50 border border-sand-150 p-3 grid md:grid-cols-12 gap-3 items-end"
            >
              <div className="md:col-span-5">
                <Label>Item</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-bark">{line.name}</span>
                  <Badge tone="neutral">{line.category}</Badge>
                </div>
              </div>
              <div className="md:col-span-3">
                <Label>Unit cost (ex-GST)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={line.unitCostExGst}
                  onChange={(e) => onPatch(line.id, { unitCostExGst: Number(e.target.value) })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={line.quantity}
                  onChange={(e) => onPatch(line.id, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="md:col-span-1 text-right tabular-nums text-sm text-bark">
                ${(line.unitCostExGst * line.quantity).toFixed(2)}
              </div>
              <div className="md:col-span-1 text-right">
                <button
                  type="button"
                  onClick={() => onRemove(line.id)}
                  className="text-xs text-text-tertiary hover:text-bark"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-sand-50 border border-sand-150 p-3 space-y-2">
        <Label>Add packaging</Label>
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder="e.g. Ointment jar, dropper, syringe"
            onChange={(e) => void search(e.target.value)}
            onFocus={() => setOpen(true)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Browse"}
          </Button>
        </div>
        {open && (
          <div className="rounded-xl border border-sand-150 bg-white max-h-64 overflow-auto divide-y divide-sand-150">
            {(matches.length ? matches : []).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onAdd(m);
                  setQuery("");
                  setMatches([]);
                }}
                className="w-full text-left px-3 py-2 hover:bg-sand-50 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-bark">{m.name}</span>
                <span className="text-xs text-text-tertiary">
                  {m.category} · ${Number(m.unit_cost_ex_gst).toFixed(2)}
                </span>
              </button>
            ))}
            {query && matches.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-tertiary">No matches</div>
            )}
            {!query && (
              <div className="px-3 py-2 text-xs text-text-tertiary">Start typing to search the catalogue.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
