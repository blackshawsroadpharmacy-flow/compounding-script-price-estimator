import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brc/Shell";
import { Card, InfoCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { supabase } from "@/integrations/supabase/client";
import {
  parseDispensingCsv,
  type ParsedRow,
} from "@/lib/parseDispensingReport";

export const Route = createFileRoute("/admin/import")({
  head: () => ({
    meta: [
      { title: "Import dispensing report — Burke Road Compounding" },
      { name: "description", content: "Upload the dispensing software CSV to refresh price history." },
    ],
  }),
  component: AdminImportPage,
});

const BATCH = 200;

function AdminImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ line: number; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ upserted: number; failed: number } | null>(null);

  const stats = useMemo(() => {
    const withDate = parsed.filter((r) => r.dispensed_date).length;
    const withForm = parsed.filter((r) => r.dosage_form).length;
    const withQty = parsed.filter((r) => r.quantity != null).length;
    const warned = parsed.filter((r) => r.warnings.length > 0).length;
    return { total: parsed.length, withDate, withForm, withQty, warned };
  }, [parsed]);

  async function handleFile(file: File) {
    setDone(null);
    setFileName(file.name);
    const text = await file.text();
    const { rows, errors } = parseDispensingCsv(text);
    setParsed(rows);
    setParseErrors(errors);
    if (errors.length) toast.warning(`${errors.length} row(s) skipped during parse`);
    else toast.success(`Parsed ${rows.length} rows`);
  }

  async function commit() {
    if (!parsed.length) return;
    setBusy(true);
    let upserted = 0;
    let failed = 0;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const slice = parsed.slice(i, i + BATCH).map((r) => ({
        script_number: r.script_number,
        dispensed_date: r.dispensed_date,
        description: r.description,
        price: r.price,
        dosage_form: r.dosage_form,
        quantity: r.quantity,
      }));
      const { error } = await supabase
        .from("price_history")
        .upsert(slice, { onConflict: "script_number" });
      if (error) {
        failed += slice.length;
        console.error("[import] batch failed", error);
      } else {
        upserted += slice.length;
      }
    }
    setBusy(false);
    setDone({ upserted, failed });
    if (failed === 0) toast.success(`Upserted ${upserted} rows`);
    else toast.error(`${failed} failed, ${upserted} ok`);
  }

  const preview = parsed.slice(0, 20);

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-serif">Import dispensing report</h1>
          <p className="text-text-secondary max-w-2xl">
            Upload the four-column CSV from the dispensing software
            (<span className="font-mono text-sm">Date, Script Number, Description, Price</span>).
            Dates are read day-first (Australian format). Rows are upserted by
            script number, so re-uploading an updated report is safe — existing
            scripts are refreshed in place.
          </p>
        </div>

        <Card className="space-y-6">
          <div>
            <label className="block">
              <span className="text-sm text-text-secondary">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="mt-2 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-bark file:text-text-inverted hover:file:bg-bark/90"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
            {fileName && (
              <div className="mt-3 text-sm text-text-tertiary">Selected: {fileName}</div>
            )}
          </div>

          {parsed.length > 0 && (
            <>
              <div className="grid md:grid-cols-5 gap-3">
                <InfoCard>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Rows</div>
                  <div className="font-serif text-3xl tabular-nums">{stats.total}</div>
                </InfoCard>
                <InfoCard>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Dated</div>
                  <div className="font-serif text-3xl tabular-nums">{stats.withDate}</div>
                </InfoCard>
                <InfoCard>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Form detected</div>
                  <div className="font-serif text-3xl tabular-nums">{stats.withForm}</div>
                </InfoCard>
                <InfoCard>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Qty detected</div>
                  <div className="font-serif text-3xl tabular-nums">{stats.withQty}</div>
                </InfoCard>
                <InfoCard>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Warnings</div>
                  <div className="font-serif text-3xl tabular-nums">{stats.warned}</div>
                </InfoCard>
              </div>

              {parseErrors.length > 0 && (
                <div className="rounded-xl bg-sand-100 border border-sand-150 p-4 text-sm">
                  <div className="font-medium mb-1">Skipped {parseErrors.length} unparseable row(s):</div>
                  <ul className="text-text-secondary list-disc pl-5 max-h-32 overflow-auto">
                    {parseErrors.slice(0, 12).map((e, i) => (
                      <li key={i}>Line {e.line}: {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-2xl bg-sand-50 border border-sand-150 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-sand-100 text-left text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Script #</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Form</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-right">Price</th>
                      <th className="px-3 py-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-150">
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-text-secondary tabular-nums">{r.dispensed_date ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{r.script_number}</td>
                        <td className="px-3 py-2 text-bark">{r.description}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.dosage_form ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.quantity ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${r.price.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          {r.warnings.length > 0 && <Badge tone="review">{r.warnings.join(", ")}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > preview.length && (
                  <div className="px-3 py-2 text-xs text-text-tertiary bg-sand-100/40">
                    Showing first {preview.length} of {parsed.length}.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-text-secondary">
                  Upsert key: <span className="font-mono">script_number</span> — safe to re-run.
                </div>
                <Button variant="primary" onClick={commit} disabled={busy}>
                  {busy ? "Importing…" : `Upsert ${parsed.length} rows`}
                </Button>
              </div>

              {done && (
                <div className="rounded-xl bg-sand-100 border border-sand-150 p-4 text-sm">
                  Imported {done.upserted}. Failed {done.failed}.
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
