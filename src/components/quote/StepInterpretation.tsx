import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, InfoCard, WarningCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge, type BadgeTone } from "@/components/brc/Badge";
import { useQuote } from "@/state/quote";
import type { BomLine } from "@/lib/pricing";
import {
  interpretPrescription,
  type InterpretedFormulation,
  type InterpretedIngredient,
} from "@/lib/interpretation.functions";

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
  const [draft, setDraft] = useState<InterpretedFormulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const interpret = async () => {
    if (!text.trim()) return;
    setStatus("loading");
    setError(null);
    try {
      const result = await run({ data: { text } });
      setDraft(result);
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

  const accept = () => {
    if (!draft) return;
    const bom: BomLine[] = draft.ingredients.map((ing) => toBomLine(ing));
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

  return (
    <Card className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl">AI interpretation</h2>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            A draft formulation grounded against the dispensary's ingredient
            master. Review and accept to pre-fill the pharmacist worksheet.
          </p>
        </div>
        {draft && (
          <Badge tone={confidenceTone(draft.overallConfidence)}>
            {draft.overallConfidence} confidence
          </Badge>
        )}
      </div>

      <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-2">
          Prescription text
        </div>
        <p className="text-bark leading-relaxed whitespace-pre-wrap">
          {text || <span className="text-text-tertiary">No text provided.</span>}
        </p>
      </div>

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
        <div className="space-y-5">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Dosage form" value={draft.dosageForm} />
            <Field
              label="Final pack quantity"
              value={`${draft.quantity} ${draft.quantityUnit}`}
            />
            <Field
              label="Difficulty"
              value={draft.difficultyTags.map((d) => d.tag).join(", ")}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Drafted ingredients
            </div>
            <div className="space-y-2">
              {draft.ingredients.map((ing, idx) => (
                <IngredientRow key={idx} ing={ing} />
              ))}
            </div>
          </div>

          {draft.notes && (
            <InfoCard className="text-sm text-text-secondary whitespace-pre-wrap">
              <span className="font-medium text-bark">Notes from AI:</span>{" "}
              {draft.notes}
            </InfoCard>
          )}

          {draft.warnings.length > 0 && (
            <WarningCard>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {draft.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </WarningCard>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-2">
          {status === "ready" && (
            <Button variant="secondary" onClick={interpret}>Re-interpret</Button>
          )}
          <Button
            variant="primary"
            disabled={status !== "ready"}
            onClick={accept}
          >
            Accept & continue
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-sand-50 border border-sand-150 p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="text-bark mt-1">{value || "—"}</div>
    </div>
  );
}

function IngredientRow({ ing }: { ing: InterpretedIngredient }) {
  const top = ing.candidates[0];
  const badges: { tone: BadgeTone; label: string }[] = [];
  if (ing.inferred) badges.push({ tone: "lowConfidence", label: "Inferred" });
  if (ing.lowConfidence) badges.push({ tone: "lowConfidence", label: "Low confidence" });
  if (!top || top.manual_check || top.unit_cost_ex_gst == null)
    badges.push({ tone: "manual", label: "Manual price needed" });
  else badges.push({ tone: "supplier", label: "Supplier matched" });

  return (
    <div className="rounded-2xl bg-sand-50 border border-sand-150 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {ing.role}
        </span>
        <span className="text-bark font-medium">{ing.name}</span>
        <span className="text-sm text-text-secondary tabular-nums">
          {ing.quantity} {ing.unit}
        </span>
        {ing.strength && (
          <span className="text-xs text-text-tertiary">({ing.strength})</span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {badges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
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
      {ing.note && (
        <div className="text-xs text-text-tertiary italic">{ing.note}</div>
      )}
    </div>
  );
}

function toBomLine(ing: InterpretedIngredient): BomLine {
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
