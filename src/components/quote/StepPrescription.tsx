import { Textarea } from "@/components/brc/Field";
import { Button } from "@/components/brc/Button";
import { Card } from "@/components/brc/Card";
import { useQuote } from "@/state/quote";

const EXAMPLES = [
  "Benzocaine 20%, Lidocaine 6%, Tetracaine 4% Topical Cream 50g",
  "Minoxidil 1 MG Capsule x 100",
  "Gabapentin 7%, Amitriptyline 4%, Clonidine 0.2% Cream 100g",
  "Melatonin 3 MG Slow Release Oral Capsules x 56",
  "Progesterone 100 mg Oral Sublingual Tablets x 30",
];

export function StepPrescription({ onNext }: { onNext: () => void }) {
  const text = useQuote((s) => s.draft.prescriptionText);
  const update = useQuote((s) => s.update);
  return (
    <Card className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl md:text-4xl">Prescription input</h2>
        <p className="text-text-secondary leading-relaxed max-w-2xl">
          Enter the doctor's prescription in plain text. The next step drafts a
          structured formulation that you review before any price is shown.
        </p>
      </div>

      <div>
        <Textarea
          rows={8}
          placeholder="e.g. Gabapentin 7%, Amitriptyline 4%, Clonidine 0.2% Cream 100g"
          value={text}
          onChange={(e) => update({ prescriptionText: e.target.value })}
          className="text-base"
        />
        <p className="text-xs text-text-tertiary mt-2">
          You will review and edit the formulation before pricing.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Example prescriptions
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => update({ prescriptionText: ex })}
              className="rounded-full bg-sand-50 border border-sand-150 px-3 py-1.5 text-xs text-bark hover:bg-sand-150 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button
          variant="primary"
          disabled={text.trim().length === 0}
          onClick={onNext}
        >
          Interpret prescription
        </Button>
      </div>
    </Card>
  );
}
