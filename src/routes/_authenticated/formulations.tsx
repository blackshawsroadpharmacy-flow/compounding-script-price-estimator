import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brc/Shell";
import { Card, InfoCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { Input, Label, Select } from "@/components/brc/Field";
import {
  listFormulations,
  loadFormulationIntoDraft,
  seedFormulationsFromHistory,
  activeIngredientSummary,
  type FormulationRow,
} from "@/lib/formulations";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/formulations")({
  head: () => ({
    meta: [
      { title: "Formulation library — Burke Road Compounding" },
      {
        name: "description",
        content:
          "Searchable library of saved compounded formulations. Re-use a past preparation to skip AI interpretation and load straight into the pharmacist edit step.",
      },
    ],
  }),
  component: FormulationsPage,
});

const FORMS = [
  "all",
  "capsule",
  "cream",
  "ointment",
  "gel",
  "lotion",
  "solution",
  "suspension",
  "troche",
  "pessary",
];

function FormulationsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FormulationRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState("all");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await listFormulations({ search, form });
      setRows(data);
    } catch (e) {
      toast.error("Could not load library: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const counts = useMemo(() => {
    const byForm = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.dosage_form ?? "—";
      byForm.set(k, (byForm.get(k) ?? 0) + 1);
    });
    return byForm;
  }, [rows]);

  const onUse = async (r: FormulationRow) => {
    await loadFormulationIntoDraft(r, { jumpToStep: 3 });
    toast.success(`Loaded "${r.name}" into a new quote`);
    navigate({ to: "/quote/new" });
  };

  const onDelete = async (r: FormulationRow) => {
    if (!confirm(`Delete "${r.name}" from the library?`)) return;
    const { error } = await supabase.from("formulations").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void refresh();
  };

  const onSeed = async () => {
    if (!confirm("Derive starter formulations from price history? This may insert hundreds of rows tagged 'history'.")) return;
    setSeeding(true);
    try {
      const { created, skipped } = await seedFormulationsFromHistory();
      toast.success(`Seeded ${created} new formulations (${skipped} already in library)`);
      await refresh();
    } catch (e) {
      toast.error("Seed failed: " + (e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12 md:py-16 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Library</div>
            <h1 className="text-4xl md:text-5xl">Formulation library</h1>
            <p className="text-text-secondary max-w-2xl">
              Reusable past preparations. Load one into a new quote to skip the AI interpretation step.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onSeed} disabled={seeding}>
              {seeding ? "Seeding…" : "Seed from history"}
            </Button>
            <Button variant="primary" onClick={() => navigate({ to: "/quote/new" })}>
              New quote
            </Button>
          </div>
        </header>

        <Card className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Search</Label>
              <Input
                placeholder="e.g. Minoxidil, Gabapentin, capsule…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Label>Dosage form</Label>
              <Select value={form} onChange={(e) => setForm(e.target.value)}>
                {FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f === "all" ? "All forms" : f} {f !== "all" && counts.get(f) ? `(${counts.get(f)})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="text-xs text-text-tertiary">
            {loading ? "Loading…" : `${rows.length} formulation${rows.length === 1 ? "" : "s"}`}
          </div>
        </Card>

        {!loading && rows.length === 0 && (
          <InfoCard>
            <div className="font-medium mb-1">No formulations yet</div>
            <p className="text-sm">
              Save one from the final step of a quote, or click <strong>Seed from history</strong> to derive starter
              entries from dispense history.
            </p>
          </InfoCard>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <Card key={r.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h3 className="text-lg leading-snug break-words">{r.name}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {r.dosage_form && <Badge tone="neutral">{r.dosage_form}</Badge>}
                    {r.quantity != null && (
                      <Badge tone="neutral">
                        {r.quantity} {r.quantity_unit ?? ""}
                      </Badge>
                    )}
                    <Badge tone={r.source === "pharmacist" ? "supplier" : "neutral"}>{r.source}</Badge>
                    {r.bom.length === 0 && <Badge tone="manual">inferred — BOM empty</Badge>}
                  </div>
                </div>
                <div className="text-right text-xs text-text-tertiary shrink-0">
                  <div>Used {r.times_used}×</div>
                  {r.last_used_at && (
                    <div>{new Date(r.last_used_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              <div className="text-sm text-text-secondary">
                <span className="text-text-tertiary">Actives: </span>
                {activeIngredientSummary(r.bom)}
              </div>

              {r.notes && (
                <div className="text-xs text-text-tertiary line-clamp-2">{r.notes}</div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  className="text-xs text-text-tertiary hover:text-bark transition-colors"
                >
                  Delete
                </button>
                <Button variant="primary" onClick={() => onUse(r)}>
                  Use in new quote
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
