import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, InfoCard, WarningCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge, type BadgeTone } from "@/components/brc/Badge";
import { Input, Label, Select, Textarea } from "@/components/brc/Field";
import { useQuote } from "@/state/quote";
import type { BomLine } from "@/lib/pricing";
import {
  interpretPrescription,
  type InterpretedFormulation,
  type InterpretedIngredient,
} from "@/lib/interpretation.functions";

type EditableIngredient = InterpretedIngredient & { _id: string };

type Draft = Omit<InterpretedFormulation, "ingredients"> & {
  ingredients: EditableIngredient[];
};

const FORMS = [
  "capsule", "cream", "ointment", "gel", "paste", "lotion",
  "solution", "suspension", "liquid", "drops", "troche", "pessary",
];
const UNITS = ["mg", "g", "mL", "each"];
type IngredientRole = "active" | "base" | "excipient";
const ROLES: IngredientRole[] = ["active", "base", "excipient"];

const LIQUID_FORMS = new Set(["solution", "suspension", "liquid", "drops", "lotion"]);
const SEMISOLID_FORMS = new Set(["cream", "ointment", "gel", "paste"]);
const COUNTED_FORMS = new Set(["capsule", "troche", "pessary"]);

type Severity = "error" | "warning";
interface Issue { severity: Severity; message: string }

/**
 * Per-ingredient sanity checks. Errors block the Accept button; warnings are
 * flagged inline so the pharmacist can override knowingly.
 */
function validateIngredient(
  ing: EditableIngredient,
  draft: Draft,
): Issue[] {
  const issues: Issue[] = [];
  const form = draft.dosageForm.toLowerCase();

  if (!ing.name.trim()) issues.push({ severity: "error", message: "Name required" });
  if (!(ing.quantity > 0)) issues.push({ severity: "error", message: "Quantity must be > 0" });
  if (!UNITS.includes(ing.unit)) issues.push({ severity: "error", message: `Unit "${ing.unit}" not recognised` });

  // Unit / form coherence.
  if (ing.unit === "each" && !COUNTED_FORMS.has(form) && ing.role !== "base") {
    issues.push({ severity: "warning", message: `"each" unit unusual for a ${form}` });
  }
  if (ing.unit === "mL" && SEMISOLID_FORMS.has(form) && ing.role === "active") {
    issues.push({ severity: "warning", message: `Active in mL for a ${form} — usually mg` });
  }
  if (ing.unit === "g" && ing.role === "active" && ing.quantity >= 10) {
    issues.push({ severity: "warning", message: `Active dose ${ing.quantity} g looks high — confirm units` });
  }
  if (ing.role === "base" && COUNTED_FORMS.has(form) && ing.unit !== "each") {
    issues.push({ severity: "warning", message: `Base for ${form} usually counted as "each" (shells)` });
  }
  if (ing.role === "base" && (LIQUID_FORMS.has(form) || SEMISOLID_FORMS.has(form))
      && !["g", "mL"].includes(ing.unit)) {
    issues.push({ severity: "warning", message: `Vehicle for ${form} usually measured in g or mL` });
  }

  // Strength % cross-check against pack quantity (only meaningful for actives
  // in a bulk pack: cream/gel/ointment/lotion/solution/suspension).
  if (ing.role === "active" && ing.strength) {
    const pct = parsePercent(ing.strength);
    if (pct != null && (SEMISOLID_FORMS.has(form) || LIQUID_FORMS.has(form))) {
      const packMass = packMassInMg(draft.quantity, draft.quantityUnit);
      const expectedMg = packMass != null ? packMass * (pct / 100) : null;
      const actualMg = toMg(ing.quantity, ing.unit);
      if (expectedMg != null && actualMg != null && expectedMg > 0) {
        const drift = Math.abs(actualMg - expectedMg) / expectedMg;
        if (drift > 0.2) {
          issues.push({
            severity: "warning",
            message: `${pct}% of ${draft.quantity}${draft.quantityUnit} ≈ ${fmtMg(expectedMg)}, got ${fmtMg(actualMg)}`,
          });
        }
      }
    }
  }

  return issues;
}

function parsePercent(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}
function toMg(qty: number, unit: string): number | null {
  if (unit === "mg") return qty;
  if (unit === "g") return qty * 1000;
  if (unit === "mL") return qty * 1000; // assume density 1 (water-like) for the sanity check
  return null;
}
function packMassInMg(qty: number, unit: string): number | null {
  if (!(qty > 0)) return null;
  if (unit === "g" || unit === "mL") return qty * 1000;
  return null;
}
function fmtMg(mg: number): string {
  if (mg >= 1000) return `${(mg / 1000).toFixed(2)} g`;
  return `${mg.toFixed(0)} mg`;
}

export function StepInterpretation({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const text = useQuote((s) => s.draft.prescriptionText);
  const update = useQuote((s) => s.update);
  const run = useServerFn(interpretPrescription);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  const interpret = async () => {
    if (!text.trim()) return;
    setStatus("loading");
    setError(null);
    try {
      const result = await run({ data: { text } });
      setDraft({
        ...result,
        ingredients: result.ingredients.map((i) => ({ ...i, _id: crypto.randomUUID() })),
      });
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Interpretation failed.");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (status === "idle" && text.trim()) void interpret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchDraft = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const patchIngredient = (id: string, patch: Partial<EditableIngredient>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            ingredients: d.ingredients.map((i) =>
              i._id === id ? { ...i, ...patch } : i,
            ),
          }
        : d,
    );
  const removeIngredient = (id: string) =>
    setDraft((d) =>
      d ? { ...d, ingredients: d.ingredients.filter((i) => i._id !== id) } : d,
    );
  const addIngredient = (role: IngredientRole) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            ingredients: [
              ...d.ingredients,
              {
                _id: crypto.randomUUID(),
                name: "",
                role,
                quantity: 0,
                unit: role === "active" ? "mg" : role === "base" ? "g" : "each",
                lowConfidence: false,
                inferred: true,
                note: null,
                source: null,
                strength: null,
                candidates: [],
              },
            ],
          }
        : d,
    );

  const accept = () => {
    if (!draft) return;
    const bom: BomLine[] = draft.ingredients.map(toBomLine);
    update({
      dosageForm: draft.dosageForm,
      quantity: draft.quantity,
      quantityUnit: draft.quantityUnit,
      bom,
      difficultyTags: draft.difficultyTags,
      notes: draft.notes,
      aiInterpreted: true,
    });
    onNext();
  };

  // Per-row + aggregate validation.
  const rowIssues = useMemo(() => {
    if (!draft) return new Map<string, Issue[]>();
    return new Map(
      draft.ingredients.map((ing) => [ing._id, validateIngredient(ing, draft)] as const),
    );
  }, [draft]);

  const aggregateIssues = useMemo<Issue[]>(() => {
    if (!draft) return [];
    const list: Issue[] = [];
    if (!(draft.quantity > 0)) list.push({ severity: "error", message: "Pack quantity must be > 0" });
    if (!UNITS.includes(draft.quantityUnit))
      list.push({ severity: "error", message: `Pack unit "${draft.quantityUnit}" not recognised` });
    if (draft.ingredients.length === 0)
      list.push({ severity: "error", message: "At least one ingredient is required" });
    if (draft.ingredients.length > 0 && !draft.ingredients.some((i) => i.role === "active"))
      list.push({ severity: "warning", message: "No active ingredient flagged" });
    if (COUNTED_FORMS.has(draft.dosageForm) && draft.quantityUnit !== "each")
      list.push({ severity: "warning", message: `${draft.dosageForm} pack usually counted in "each"` });
    if ((LIQUID_FORMS.has(draft.dosageForm) || SEMISOLID_FORMS.has(draft.dosageForm))
        && !["g", "mL"].includes(draft.quantityUnit))
      list.push({ severity: "warning", message: `${draft.dosageForm} pack usually in g or mL` });
    return list;
  }, [draft]);

  const allIssues: Issue[] = useMemo(() => {
    const out = [...aggregateIssues];
    rowIssues.forEach((issues) => out.push(...issues));
    return out;
  }, [aggregateIssues, rowIssues]);

  const errorCount = allIssues.filter((i) => i.severity === "error").length;
  const warnCount = allIssues.filter((i) => i.severity === "warning").length;


  return (
    <Card className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl">AI interpretation</h2>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            Review the draft side-by-side with the prescription. Edit any line
            inline before passing it to the pharmacist worksheet.
          </p>
        </div>
        {draft && (
          <Badge tone={confidenceTone(draft.overallConfidence)}>
            {draft.overallConfidence} confidence
          </Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <SourcePanel text={text} highlight={activeSource} />

        <div className="space-y-4">
          {status === "loading" && (
            <InfoCard className="text-text-secondary text-sm">
              Drafting a structured formulation from the prescription…
            </InfoCard>
          )}
          {status === "error" && (
            <WarningCard>
              {error ?? "Could not interpret the prescription."}
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={interpret}>Retry</Button>
              </div>
            </WarningCard>
          )}
          {status === "ready" && draft && (
            <>
              {draft.reasoning && (
                <InfoCard className="text-sm text-text-secondary leading-relaxed">
                  <span className="font-medium text-bark">AI reasoning. </span>
                  {draft.reasoning}
                </InfoCard>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Dosage form</Label>
                  <Select
                    value={draft.dosageForm}
                    onChange={(e) => patchDraft({ dosageForm: e.target.value })}
                  >
                    {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={draft.quantity}
                    onChange={(e) => patchDraft({ quantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select
                    value={draft.quantityUnit}
                    onChange={(e) => patchDraft({ quantityUnit: e.target.value })}
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {status === "ready" && draft && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl">Drafted ingredients</h3>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <Button
                  key={r}
                  variant="secondary"
                  size="sm"
                  onClick={() => addIngredient(r)}
                >
                  + {r}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {draft.ingredients.map((ing) => (
              <EditableRow
                key={ing._id}
                ing={ing}
                issues={rowIssues.get(ing._id) ?? []}
                onHover={setActiveSource}
                onChange={(p) => patchIngredient(ing._id, p)}
                onRemove={() => removeIngredient(ing._id)}
              />
            ))}
            {draft.ingredients.length === 0 && (
              <InfoCard className="text-text-secondary text-sm">
                All ingredients removed. Add at least one before accepting.
              </InfoCard>
            )}
          </div>
        </div>
      )}

      {status === "ready" && draft && (
        <div className="space-y-2">
          <Label>Pharmacist notes</Label>
          <Textarea
            rows={3}
            placeholder="Add context, BUD, patient counselling, special handling…"
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
          />
        </div>
      )}

      {status === "ready" && draft && (errorCount > 0 || warnCount > 0 || draft.warnings.length > 0) && (
        <WarningCard>
          <div className="text-sm font-medium text-bark mb-1">
            {errorCount > 0
              ? `${errorCount} issue${errorCount === 1 ? "" : "s"} to fix before continuing`
              : `${warnCount} sanity check${warnCount === 1 ? "" : "s"} to review`}
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {aggregateIssues.map((i, idx) => (
              <li key={`a-${idx}`} className={i.severity === "error" ? "text-[#7a2218]" : ""}>
                {i.message}
              </li>
            ))}
            {draft.warnings.map((w, i) => <li key={`m-${i}`}>{w}</li>)}
          </ul>
        </WarningCard>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-2">
          {status === "ready" && (
            <Button variant="secondary" onClick={interpret}>Re-interpret</Button>
          )}
          <Button
            variant="primary"
            disabled={status !== "ready" || !draft || errorCount > 0}
            onClick={accept}
          >
            Accept & continue
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SourcePanel({ text, highlight }: { text: string; highlight: string | null }) {
  const segments = useMemo(() => splitHighlight(text, highlight), [text, highlight]);
  return (
    <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Prescription source
        </div>
        {highlight && (
          <div className="text-xs text-text-tertiary">hover a line to highlight</div>
        )}
      </div>
      {text ? (
        <p className="text-bark leading-relaxed whitespace-pre-wrap">
          {segments.map((s, i) =>
            s.highlight ? (
              <mark
                key={i}
                className="bg-sunlight/60 text-bark rounded px-0.5"
              >
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
      ) : (
        <span className="text-text-tertiary">No text provided.</span>
      )}
    </div>
  );
}

function splitHighlight(text: string, needle: string | null) {
  if (!needle || !needle.trim() || !text) return [{ text, highlight: false }];
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return [{ text, highlight: false }];
  return [
    { text: text.slice(0, i), highlight: false },
    { text: text.slice(i, i + needle.length), highlight: true },
    { text: text.slice(i + needle.length), highlight: false },
  ];
}

function EditableRow({
  ing,
  issues,
  onChange,
  onRemove,
  onHover,
}: {
  ing: EditableIngredient;
  issues: Issue[];
  onChange: (p: Partial<EditableIngredient>) => void;
  onRemove: () => void;
  onHover: (s: string | null) => void;
}) {
  const top = ing.candidates[0];
  const badges: { tone: BadgeTone; label: string }[] = [];
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarn = issues.some((i) => i.severity === "warning");
  if (ing.inferred) badges.push({ tone: "lowConfidence", label: "Inferred" });
  if (ing.lowConfidence) badges.push({ tone: "lowConfidence", label: "Low confidence" });
  if (!top || top.manual_check || top.unit_cost_ex_gst == null)
    badges.push({ tone: "manual", label: "Manual price" });
  else badges.push({ tone: "supplier", label: "Supplier matched" });
  if (hasError) badges.push({ tone: "manual", label: "Needs fix" });
  else if (hasWarn) badges.push({ tone: "review", label: "Check unit" });

  return (
    <div
      className={
        "rounded-2xl bg-sand-50 border p-4 space-y-3 " +
        (hasError
          ? "border-[#7a2218]/40 bg-[#7a2218]/5"
          : hasWarn
            ? "border-sunlight/70"
            : "border-sand-150")
      }
      onMouseEnter={() => onHover(ing.source ?? null)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={ing.role}
          onChange={(e) => onChange({ role: e.target.value as IngredientRole })}
          className="!w-auto !py-1.5 !px-3 text-xs uppercase tracking-wide"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
        </div>
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
          <Input
            value={ing.name}
            placeholder="e.g. Gabapentin"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Quantity</Label>
          <Input
            type="number"
            value={ing.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Unit</Label>
          <Select value={ing.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>Strength</Label>
          <Input
            value={ing.strength ?? ""}
            placeholder="e.g. 5%"
            onChange={(e) => onChange({ strength: e.target.value || null })}
          />
        </div>
      </div>

      {top && (
        <div className="text-xs text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
          <span>→ {top.ingredient}</span>
          {top.supplier && <span>{top.supplier}</span>}
          {top.pack_size && <span>{top.pack_size}</span>}
          {top.unit_cost_ex_gst != null && !top.manual_check && (
            <span className="tabular-nums">
              ${Number(top.unit_cost_ex_gst).toFixed(4)}/{top.canonical_unit ?? "unit"} ex-GST
            </span>
          )}
        </div>
      )}

      {ing.source && (
        <div className="text-xs text-text-tertiary italic border-l-2 border-sand-150 pl-2">
          “{ing.source}”
        </div>
      )}

      <Textarea
        rows={2}
        placeholder="Line note (optional)"
        value={ing.note ?? ""}
        onChange={(e) => onChange({ note: e.target.value || null })}
      />
    </div>
  );
}

function toBomLine(ing: EditableIngredient): BomLine {
  const top = ing.candidates[0];
  const matched = top && !top.manual_check && top.unit_cost_ex_gst != null;
  return {
    id: crypto.randomUUID(),
    name: ing.name,
    role: ing.role,
    quantity: ing.quantity,
    unit: ing.unit,
    unitCostExGst: matched ? Number(top.unit_cost_ex_gst) : null,
    matchedIngredientId: top?.id ?? null,
    matchedSupplier: top?.supplier ?? null,
    wastagePct: 0,
    manualPriceNeeded: !matched,
    lowConfidence: ing.lowConfidence || ing.inferred,
    note: ing.note ?? undefined,
  };
}

function confidenceTone(c: "high" | "medium" | "low"): BadgeTone {
  if (c === "high") return "supplier";
  if (c === "medium") return "lowConfidence";
  return "manual";
}
