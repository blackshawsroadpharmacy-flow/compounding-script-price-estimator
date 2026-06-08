CREATE TABLE public.formulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dosage_form text,
  quantity numeric(10,2),
  quantity_unit text,
  bom jsonb NOT NULL DEFAULT '[]'::jsonb,
  packaging jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_make_minutes numeric(10,2),
  notes text,
  source text NOT NULL DEFAULT 'pharmacist',
  times_used integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulations TO authenticated;
GRANT ALL ON public.formulations TO service_role;

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "f_select" ON public.formulations FOR SELECT TO authenticated USING (true);
CREATE POLICY "f_insert" ON public.formulations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "f_update" ON public.formulations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "f_delete" ON public.formulations FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_formulations_search ON public.formulations
  USING gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(dosage_form,'')));
CREATE INDEX idx_formulations_form ON public.formulations (dosage_form);
CREATE INDEX idx_formulations_last_used ON public.formulations (last_used_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_formulations_updated_at
  BEFORE UPDATE ON public.formulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();