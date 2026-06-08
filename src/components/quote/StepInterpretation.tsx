import { Card, WarningCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { useQuote } from "@/state/quote";

export function StepInterpretation({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const text = useQuote((s) => s.draft.prescriptionText);
  return (
    <Card className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl">AI interpretation</h2>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            The model will draft a structured formulation from the prescription
            text and pre-fill the next step for your review.
          </p>
        </div>
        <Badge tone="lowConfidence">Phase 2</Badge>
      </div>

      <div className="rounded-2xl bg-sand-50 border border-sand-150 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-2">
          Prescription text
        </div>
        <p className="text-bark leading-relaxed whitespace-pre-wrap">
          {text || <span className="text-text-tertiary">No text provided.</span>}
        </p>
      </div>

      <WarningCard>
        AI interpretation is wired up in Phase 2. For now, build the formulation
        manually in the next step. The interpretation will pre-fill the same
        worksheet, with badges for AI-interpreted, low-confidence, and inferred
        excipient lines.
      </WarningCard>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>
          Continue to pharmacist edit
        </Button>
      </div>
    </Card>
  );
}
