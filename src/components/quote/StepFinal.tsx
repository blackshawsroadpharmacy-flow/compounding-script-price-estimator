import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, WarningCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { Input, Label, Textarea } from "@/components/brc/Field";
import { useQuote } from "@/state/quote";
import { calculatePrice, formatMoney } from "@/lib/pricing";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";
import { findSimilarFormulation, saveFormulation, updateFormulation } from "@/lib/formulations";

export function StepFinal({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const draft = useQuote((s) => s.draft);
  const update = useQuote((s) => s.update);
  const { settings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingFormulation, setSavingFormulation] = useState(false);
  const [savedFormulationId, setSavedFormulationId] = useState<string | null>(null);
  const [formulationName, setFormulationName] = useState("");
  const [showSaveFormulation, setShowSaveFormulation] = useState(false);

  const openSaveFormulation = () => {
    const guess = draft.bom
      .filter((l) => l.role === "active")
      .map((l) => `${l.name}${l.quantity ? ` ${l.quantity}${l.unit}` : ""}`)
      .filter(Boolean)
      .join(", ");
    const suffix = draft.dosageForm ? ` ${draft.dosageForm}` : "";
    const qty = draft.quantity ? ` ${draft.quantity}${draft.quantityUnit}` : "";
    setFormulationName(guess ? `${guess}${suffix}${qty}` : draft.prescriptionText.slice(0, 80));
    setShowSaveFormulation(true);
  };

  const saveAsFormulation = async () => {
    if (!formulationName.trim()) return toast.error("Give it a name first");
    setSavingFormulation(true);
    try {
      const existing = await findSimilarFormulation(formulationName, draft.dosageForm);
      if (existing) {
        const ok = confirm(
          `A formulation called "${existing.name}" (${existing.dosage_form}) already exists. ` +
            `Update it with the current BOM as a new version?`,
        );
        if (ok) {
          await updateFormulation(existing.id, {
            name: formulationName,
            draft,
            source: "pharmacist",
          });
          setSavedFormulationId(existing.id);
          toast.success("Existing formulation updated");
          setShowSaveFormulation(false);
          return;
        }
      }
      const id = await saveFormulation({ name: formulationName, draft, source: "pharmacist" });
      setSavedFormulationId(id);
      toast.success("Saved to formulation library");
      setShowSaveFormulation(false);
    } catch (e) {
      toast.error("Could not save: " + (e as Error).message);
    } finally {
      setSavingFormulation(false);
    }
  };

  const breakdown = useMemo(
    () =>
      calculatePrice({
        bom: draft.bom,
        packaging: draft.packaging,
        difficultyTags: draft.difficultyTags,
        hourlyRate: draft.hourlyRateOverride ?? settings.hourlyRate,
        prepMinutes: draft.prepMinutesOverride ?? settings.prepMinutes,
        makeMinutes: draft.makeMinutes,
        markup: draft.markupOverride ?? settings.markup,
        taxable: draft.taxable,
        gstRate: settings.gstRate,
      }),
    [draft, settings],
  );

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        prescription_text: draft.prescriptionText,
        formulation: JSON.parse(JSON.stringify(draft)),
        breakdown: JSON.parse(JSON.stringify(breakdown)),
        dosage_form: draft.dosageForm,
        quantity: draft.quantity,
        price_ex_gst: Number(breakdown.priceExGst.toFixed(2)),
        price_inc_gst: Number(breakdown.priceIncGst.toFixed(2)),
        taxable: draft.taxable,
        notes: draft.notes,
        status: "finalised",
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      alert("Could not save quote: " + error.message);
      return;
    }
    setSavedId(data!.id);
    onSaved();
  };

  return (
    <Card className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl">Final quote</h2>
          <p className="text-text-secondary">
            Confirm the breakdown and save it to the audit trail.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
            Quote price
          </div>
          <div className="font-serif text-5xl md:text-6xl tabular-nums">
            {formatMoney(breakdown.priceIncGst)}
          </div>
          {draft.taxable && <div className="text-xs text-text-tertiary mt-1">includes GST</div>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5 space-y-2 text-sm">
          <h3 className="text-xl mb-2">Formulation</h3>
          <div className="flex justify-between"><span className="text-text-secondary">Form</span><span className="text-bark">{draft.dosageForm}</span></div>
          <div className="flex justify-between"><span className="text-text-secondary">Quantity</span><span className="text-bark">{draft.quantity} {draft.quantityUnit}</span></div>
          <div className="flex justify-between"><span className="text-text-secondary">BOM lines</span><span className="text-bark">{draft.bom.length}</span></div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {draft.difficultyTags.map((t) => (
              <Badge key={t.tag} tone="neutral">{t.tag} × {t.multiplier.toFixed(2)}</Badge>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5 text-sm space-y-1.5">
          <h3 className="text-xl mb-2">Breakdown</h3>
          <Row k="Ingredients" v={formatMoney(breakdown.ingredientsTotal)} />
          <Row k="Packaging" v={formatMoney(breakdown.packagingTotal)} />
          <Row k="Labour" v={formatMoney(breakdown.labourTotal)} />
          <Row k="Base cost" v={formatMoney(breakdown.baseCost)} />
          <Row k={`× Difficulty ${breakdown.difficulty.toFixed(3)}`} v={formatMoney(breakdown.costAfterDifficulty)} />
          <Row k={`× Markup ${breakdown.markup.toFixed(3)}`} v={formatMoney(breakdown.priceExGst)} bold />
          <Row k="GST" v={formatMoney(breakdown.gst)} />
          <Row k="Total inc-GST" v={formatMoney(breakdown.priceIncGst)} bold />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-text-secondary mb-1.5">
          Pharmacist notes (audit trail)
        </label>
        <Textarea
          rows={3}
          value={draft.notes}
          placeholder="e.g. Discussed taper with prescriber, used Medisca base."
          onChange={(e) => update({ notes: e.target.value })}
        />
      </div>

      {breakdown.warnings.length > 0 && (
        <WarningCard>
          <div className="font-medium mb-1">Outstanding review items</div>
          <ul className="text-sm list-disc pl-5 space-y-0.5">
            {breakdown.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </WarningCard>
      )}

      {savedId && (
        <div className="rounded-2xl bg-forest/10 border border-forest/30 text-forest p-4 text-sm">
          Quote saved to the audit trail (ID {savedId.slice(0, 8)}).
        </div>
      )}

      {savedFormulationId && (
        <div className="rounded-2xl bg-forest/10 border border-forest/30 text-forest p-4 text-sm">
          Added to the formulation library.
        </div>
      )}

      {showSaveFormulation && (
        <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5 space-y-3">
          <div className="space-y-1">
            <h3 className="text-lg">Save as formulation</h3>
            <p className="text-xs text-text-tertiary">
              The current BOM, dosage form, quantity, difficulty tags and notes will be saved for re-use.
              If a similar name and form already exists, you'll be asked to update it instead of duplicating.
            </p>
          </div>
          <div>
            <Label>Name</Label>
            <Input value={formulationName} onChange={(e) => setFormulationName(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowSaveFormulation(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveAsFormulation} disabled={savingFormulation}>
              {savingFormulation ? "Saving…" : "Save to library"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={openSaveFormulation} disabled={showSaveFormulation}>
            Save as formulation
          </Button>
          <Button variant="accent" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save final quote"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between " + (bold ? "font-medium text-bark" : "text-text-secondary")}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
