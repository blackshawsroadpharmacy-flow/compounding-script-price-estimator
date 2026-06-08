import { useEffect, useMemo, useState } from "react";
import { Card, InfoCard } from "@/components/brc/Card";
import { Button } from "@/components/brc/Button";
import { Badge } from "@/components/brc/Badge";
import { useQuote } from "@/state/quote";
import { calculatePrice, formatMoney } from "@/lib/pricing";
import { useSettings } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";

interface HistoryRow {
  id: string;
  dispensed_date: string | null;
  script_number: string | null;
  description: string;
  pos_item_description: string | null;
  price: number;
  dosage_form: string | null;
  quantity: number | null;
}

export function StepHistory({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const draft = useQuote((s) => s.draft);
  const { settings } = useSettings();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("price_history")
        .select("id,dispensed_date,script_number,description,pos_item_description,price,dosage_form,quantity")
        .order("dispensed_date", { ascending: false })
        .limit(120);
      if (draft.dosageForm) q = q.eq("dosage_form", draft.dosageForm);
      const { data } = await q;
      setRows((data ?? []) as HistoryRow[]);
      setLoading(false);
    })();
  }, [draft.dosageForm]);

  // Score by quantity proximity (when both available), else 0.5.
  const scored = useMemo(() => {
    return rows
      .map((r) => {
        let score = 0.5;
        if (r.quantity != null && draft.quantity) {
          const ratio = Math.min(r.quantity, draft.quantity) / Math.max(r.quantity, draft.quantity);
          score = ratio;
        }
        return { ...r, similarity: score };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 12);
  }, [rows, draft.quantity]);

  const prices = scored.map((r) => Number(r.price)).filter((n) => isFinite(n));
  const median = prices.length ? medianOf(prices) : null;
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const mostRecent = scored[0] ?? null;

  const inBand =
    min != null && max != null
      ? breakdown.priceIncGst >= min * 0.9 && breakdown.priceIncGst <= max * 1.1
      : null;

  return (
    <Card className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl md:text-4xl">Historical comparison</h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Recent dispensed prices for similar formulations. Use this as a sanity
          check against the calculated estimate.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <InfoCard>
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">
            Calculated
          </div>
          <div className="font-serif text-4xl tabular-nums">
            {formatMoney(breakdown.priceIncGst)}
          </div>
          <div className="text-xs text-text-tertiary mt-1">{draft.dosageForm} · {draft.quantity}{draft.quantityUnit}</div>
        </InfoCard>
        <InfoCard>
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">
            History (last {scored.length} similar)
          </div>
          {median == null ? (
            <p className="text-text-tertiary text-sm">No comparable history yet.</p>
          ) : (
            <>
              <div className="font-serif text-4xl tabular-nums">{formatMoney(median)}</div>
              <div className="text-xs text-text-secondary mt-1">
                median · range {formatMoney(min!)}–{formatMoney(max!)}
              </div>
              {inBand != null && (
                <div className="mt-3">
                  {inBand ? (
                    <Badge tone="matched">Within recent range</Badge>
                  ) : (
                    <Badge tone="review">Outside recent range — review</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </InfoCard>
      </div>

      {mostRecent && (
        <div className="text-sm text-text-secondary">
          Most recent comparable: <span className="text-bark">{mostRecent.description}</span>{" "}
          on {mostRecent.dispensed_date} · script <span className="font-mono text-xs">{mostRecent.script_number ?? "—"}</span> · {formatMoney(Number(mostRecent.price))}
        </div>
      )}

      <div className="rounded-2xl bg-sand-50 border border-sand-150 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Script #</th>
              <th className="px-4 py-3 font-medium">Formulation</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium text-right">Similarity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-150">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-text-tertiary">Loading…</td></tr>
            )}
            {!loading && scored.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-text-tertiary">No comparable history.</td></tr>
            )}
            {scored.map((r) => (
              <tr key={r.id} className="hover:bg-sand-100/40">
                <td className="px-4 py-3 text-text-secondary">{r.dispensed_date}</td>
                <td className="px-4 py-3 text-text-secondary tabular-nums font-mono text-xs">{r.script_number ?? "—"}</td>
                <td className="px-4 py-3 text-bark">{r.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.quantity ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(r.price))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-tertiary">{(r.similarity * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>Review final quote</Button>
      </div>
    </Card>
  );
}

function medianOf(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
