import { Card, WarningCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { useQuote } from "@/state/quote";
import { calculatePrice, formatMoney } from "@/lib/pricing";
import { useSettings } from "@/hooks/useSettings";
import { useMemo } from "react";

export function StepEstimate({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const draft = useQuote((s) => s.draft);
  const { settings } = useSettings();

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

  const confidenceTone =
    breakdown.confidence === "high" ? "matched" : breakdown.confidence === "medium" ? "review" : "manual";

  const UNIT_DOSE = new Set(["capsule", "troche", "pessary"]);
  const perUnit =
    UNIT_DOSE.has(draft.dosageForm) && draft.quantityUnit === "each" && draft.quantity > 0
      ? {
          count: draft.quantity,
          unitLabel: draft.dosageForm,
          costPerUnit: breakdown.ingredientsTotal / draft.quantity,
          pricePerUnit: breakdown.priceIncGst / draft.quantity,
        }
      : null;



  return (
    <Card className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl">Price estimate</h2>
          <p className="text-text-secondary">
            Ingredients + labour + packaging, scaled by difficulty and marked up.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
            Suggested retail
          </div>
          <div className="font-serif text-5xl md:text-6xl text-bark tabular-nums">
            {formatMoney(breakdown.priceIncGst)}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Badge tone={confidenceTone}>
              Confidence: {breakdown.confidence}
            </Badge>
            {draft.taxable && <Badge tone="neutral">inc GST</Badge>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5">
          <h3 className="text-xl mb-3">Ingredients</h3>
          <ul className="space-y-2 text-sm">
            {breakdown.ingredientLines.length === 0 && (
              <li className="text-text-tertiary">No ingredients</li>
            )}
            {breakdown.ingredientLines.map((l) => (
              <li key={l.id} className="flex items-center justify-between">
                <span className="text-bark truncate pr-3">{l.name || "(unnamed)"}</span>
                <span className="tabular-nums text-text-secondary">
                  {l.warning ? l.warning : formatMoney(l.cost)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-sand-150 pt-2 mt-2 font-medium">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(breakdown.ingredientsTotal)}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5">
          <h3 className="text-xl mb-3">Build-up</h3>
          <dl className="text-sm space-y-2">
            <Row k="Packaging" v={formatMoney(breakdown.packagingTotal)} />
            <Row k={`Prep (${settings.prepMinutes} min)`} v={formatMoney(breakdown.prepCost)} />
            <Row k={`Make-time (${draft.makeMinutes} min)`} v={formatMoney(breakdown.makeCost)} />
            <Row k="Labour subtotal" v={formatMoney(breakdown.labourTotal)} bold />
            <Row k="Base cost" v={formatMoney(breakdown.baseCost)} bold />
            <Row k={`× Difficulty (${breakdown.difficulty.toFixed(3)})`} v={formatMoney(breakdown.costAfterDifficulty)} />
            <Row k={`× Markup (${breakdown.markup.toFixed(3)})`} v={formatMoney(breakdown.priceExGst)} />
            <Row k="Price ex-GST" v={formatMoney(breakdown.priceExGst)} bold />
            <Row k={`GST (${draft.taxable ? "10%" : "exempt"})`} v={formatMoney(breakdown.gst)} />
            <Row k="Price inc-GST" v={formatMoney(breakdown.priceIncGst)} bold />
          </dl>
        </div>
      </div>

      {breakdown.warnings.length > 0 && (
        <WarningCard>
          <div className="font-medium mb-1">Needs review before quoting</div>
          <ul className="text-sm list-disc pl-5 space-y-0.5">
            {breakdown.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </WarningCard>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>Compare against history</Button>
      </div>
    </Card>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between " + (bold ? "font-medium text-bark" : "text-text-secondary")}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
