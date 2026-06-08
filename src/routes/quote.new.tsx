import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/brc/Shell";
import { Stepper } from "@/components/brc/Stepper";
import { StepPrescription } from "@/components/quote/StepPrescription";
import { StepInterpretation } from "@/components/quote/StepInterpretation";
import { StepEdit } from "@/components/quote/StepEdit";
import { StepEstimate } from "@/components/quote/StepEstimate";
import { StepHistory } from "@/components/quote/StepHistory";
import { StepFinal } from "@/components/quote/StepFinal";
import { useQuote } from "@/state/quote";

export const Route = createFileRoute("/quote/new")({
  head: () => ({
    meta: [
      { title: "New quote — Burke Road Compounding Price Estimator" },
      {
        name: "description",
        content:
          "Step through prescription input, formulation review, price estimate and historical comparison to produce a defensible compounded quote.",
      },
    ],
  }),
  component: NewQuotePage,
});

const STEPS = [
  { id: 1, label: "Prescription" },
  { id: 2, label: "AI interpretation" },
  { id: 3, label: "Pharmacist edit" },
  { id: 4, label: "Price estimate" },
  { id: 5, label: "Historical comparison" },
  { id: 6, label: "Final quote" },
];

function NewQuotePage() {
  const step = useQuote((s) => s.step);
  const setStep = useQuote((s) => s.setStep);

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12 md:py-16 space-y-10">
        <header className="space-y-4">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            New quote
          </div>
          <h1 className="text-4xl md:text-5xl">Build a compounded price</h1>
          <Stepper steps={STEPS} current={step} onSelect={setStep} />
        </header>

        {step === 1 && <StepPrescription onNext={() => setStep(2)} />}
        {step === 2 && (
          <StepInterpretation onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}
        {step === 3 && (
          <StepEdit onBack={() => setStep(2)} onNext={() => setStep(4)} />
        )}
        {step === 4 && (
          <StepEstimate onBack={() => setStep(3)} onNext={() => setStep(5)} />
        )}
        {step === 5 && (
          <StepHistory onBack={() => setStep(4)} onNext={() => setStep(6)} />
        )}
        {step === 6 && (
          <StepFinal onBack={() => setStep(5)} onSaved={() => undefined} />
        )}
      </div>
    </PageShell>
  );
}
