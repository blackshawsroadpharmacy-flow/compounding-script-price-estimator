import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/brc/Shell";
import { Card } from "@/components/brc/Card";
import { Badge } from "@/components/brc/Badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Burke Road Compounding Price Estimator" },
      {
        name: "description",
        content:
          "A pharmacist-facing tool for producing defensible compounded prescription prices, calibrated against the pharmacy's own dispensing history.",
      },
    ],
  }),
  component: Index,
});

const STEPS = [
  "Prescription input",
  "AI interpretation",
  "Pharmacist edit",
  "Price estimate",
  "Historical comparison",
  "Final quote",
];

const FEATURES = [
  { title: "Ingredient cost matching", body: "Search a unified supplier catalogue with ex-GST unit costs across PCCA, Medisca, Compounding Chemicals and Bella Corp." },
  { title: "Pharmacist edit step", body: "Every ingredient, quantity, supplier match and difficulty multiplier is editable before a price is shown." },
  { title: "Historical comparison", body: "Cross-check the calculated price against recent dispensed scripts of the same dosage form and similar quantity." },
  { title: "Configurable engine", body: "Hourly rate, prep minutes, markup and difficulty multipliers all live in settings — no rebuild required." },
  { title: "Audit trail", body: "Finalised quotes are saved with the full breakdown, overrides and pharmacist notes." },
  { title: "AI formulation interpretation", body: "Planned for Phase 2: free-text prescription becomes a structured, badged formulation, grounded in formulation PDFs." },
];

function Index() {
  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -z-10 left-1/2 -translate-x-1/2 top-10 h-72 w-72 rounded-full bg-sunlight/20 blur-3xl"
        />
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-24 md:py-32">
          <div className="grid md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7 space-y-6">
              <Badge tone="neutral">For compounding pharmacies</Badge>
              <h1 className="text-4xl md:text-5xl">
                Compounding prices, reviewed before they're quoted.
              </h1>
              <p className="text-text-secondary text-lg leading-relaxed max-w-xl">
                Enter the prescription, let AI draft the formulation, then review
                the quantities, ingredients, supplier costs and historical prices
                before giving a quote.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/quote/new"
                  className="inline-flex items-center rounded-full bg-bark text-text-inverted px-6 py-3 text-sm font-medium hover:bg-bark/90 transition-colors"
                >
                  Start a quote
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center rounded-full text-bark border border-bark/20 px-6 py-3 text-sm hover:bg-sand-100 transition-colors"
                >
                  How it works
                </a>
              </div>
            </div>
            <div className="md:col-span-5">
              <Card className="space-y-4">
                <div className="text-xs uppercase tracking-wide text-text-secondary">
                  The workflow
                </div>
                <ol className="space-y-2 text-sm">
                  {STEPS.map((s, i) => (
                    <li key={s} className="flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sand-25 border border-sand-150 text-xs text-text-secondary tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-bark">{s}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-t border-sand-150">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-24 md:py-32 space-y-10">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl md:text-4xl">Built for professional judgement, not blind automation.</h2>
            <p className="text-text-secondary leading-relaxed">
              The app does not silently turn guesses into prices. Ambiguous units,
              missing quantities, low-confidence matches and inferred excipients are
              clearly marked for review.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {FEATURES.map((f) => (
              <Card key={f.title} className="space-y-2">
                <h3 className="text-2xl">{f.title}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-sand-150">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-24 md:py-32 text-center space-y-6">
          <h2 className="text-3xl md:text-4xl">Ready to make quoting clearer?</h2>
          <p className="text-text-secondary max-w-xl mx-auto">
            Price with context. Review before quoting. Ingredient costs, historical
            prices and formulation notes in one place.
          </p>
          <div>
            <Link
              to="/quote/new"
              className="inline-flex items-center rounded-full bg-sunlight text-bark px-7 py-3.5 text-base font-semibold hover:bg-sunlight/85 transition-colors"
            >
              Start a quote
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
