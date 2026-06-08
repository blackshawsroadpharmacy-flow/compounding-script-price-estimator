import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  hourlyRate: number;
  prepMinutes: number;
  markup: number;
  gstRate: number;
  gstDefaultTaxable: boolean;
}

const DEFAULTS: AppSettings = {
  hourlyRate: 80,
  prepMinutes: 20,
  markup: 1.236,
  gstRate: 0.1,
  gstDefaultTaxable: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("settings").select("key,value");
      if (!mounted) return;
      const map = new Map<string, unknown>();
      (data ?? []).forEach((r: { key: string; value: unknown }) => map.set(r.key, r.value));
      setSettings({
        hourlyRate: Number(map.get("hourly_rate") ?? DEFAULTS.hourlyRate),
        prepMinutes: Number(map.get("prep_minutes") ?? DEFAULTS.prepMinutes),
        markup: Number(map.get("markup") ?? DEFAULTS.markup),
        gstRate: Number(map.get("gst_rate") ?? DEFAULTS.gstRate),
        gstDefaultTaxable: Boolean(map.get("gst_default_taxable") ?? false),
      });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);
  return { settings, loading };
}
