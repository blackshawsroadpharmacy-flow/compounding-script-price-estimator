
-- price_history
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensed_date date,
  script_number text,
  description text NOT NULL,
  pos_item_description text,
  price numeric(10,2) NOT NULL,
  dosage_form text,
  quantity numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_history_form ON public.price_history(dosage_form);
CREATE INDEX idx_price_history_date ON public.price_history(dispensed_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_history TO anon, authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ph_all" ON public.price_history FOR ALL USING (true) WITH CHECK (true);

-- ingredients_master
CREATE TABLE public.ingredients_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient text NOT NULL,
  match_key text,
  supplier text,
  supplier_code text,
  pack_size text,
  pack_price numeric(12,4),
  canonical_unit text,
  normalised_qty numeric(14,4),
  unit_cost_listed numeric(14,6),
  gst_divisor numeric(6,3),
  unit_cost_ex_gst numeric(14,6),
  status text,
  note text,
  manual_check boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ing_match ON public.ingredients_master(match_key);
CREATE INDEX idx_ing_supplier ON public.ingredients_master(supplier);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients_master TO anon, authenticated;
GRANT ALL ON public.ingredients_master TO service_role;
ALTER TABLE public.ingredients_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_all" ON public.ingredients_master FOR ALL USING (true) WITH CHECK (true);

-- packaging_catalogue
CREATE TABLE public.packaging_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  unit_cost_ex_gst numeric(12,4) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_catalogue TO anon, authenticated;
GRANT ALL ON public.packaging_catalogue TO service_role;
ALTER TABLE public.packaging_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_all" ON public.packaging_catalogue FOR ALL USING (true) WITH CHECK (true);

-- form_rules
CREATE TABLE public.form_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dosage_form text UNIQUE NOT NULL,
  parsing_convention text NOT NULL,
  base_make_minutes numeric(6,2) NOT NULL DEFAULT 15,
  variable_minutes_per_unit numeric(6,4) NOT NULL DEFAULT 0,
  default_packaging text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_rules TO anon, authenticated;
GRANT ALL ON public.form_rules TO service_role;
ALTER TABLE public.form_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_all" ON public.form_rules FOR ALL USING (true) WITH CHECK (true);

-- difficulty_rules
CREATE TABLE public.difficulty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text UNIQUE NOT NULL,
  multiplier numeric(5,3) NOT NULL DEFAULT 1.0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.difficulty_rules TO anon, authenticated;
GRANT ALL ON public.difficulty_rules TO service_role;
ALTER TABLE public.difficulty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr_all" ON public.difficulty_rules FOR ALL USING (true) WITH CHECK (true);

-- settings (key/value)
CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_all" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- quotes
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_text text,
  formulation jsonb,
  breakdown jsonb,
  overrides jsonb,
  dosage_form text,
  quantity numeric(10,2),
  price_ex_gst numeric(10,2),
  price_inc_gst numeric(10,2),
  taxable boolean NOT NULL DEFAULT false,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO anon, authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q_all" ON public.quotes FOR ALL USING (true) WITH CHECK (true);

-- Seed: form_rules
INSERT INTO public.form_rules (dosage_form, parsing_convention, base_make_minutes, variable_minutes_per_unit, default_packaging) VALUES
('capsule', 'strength_per_unit', 20, 0.35, 'capsule_bottle'),
('cream', 'percent_w_w', 25, 0, 'ointment_jar'),
('ointment', 'percent_w_w', 25, 0, 'ointment_jar'),
('gel', 'percent_w_w', 25, 0, 'ointment_jar'),
('paste', 'percent_w_w', 30, 0, 'ointment_jar'),
('lotion', 'percent_w_v', 25, 0, 'bottle'),
('solution', 'mg_per_ml', 20, 0, 'bottle'),
('suspension', 'mg_per_ml', 25, 0, 'bottle'),
('liquid', 'mg_per_ml', 20, 0, 'bottle'),
('drops', 'mg_per_ml', 25, 0, 'dropper_bottle'),
('troche', 'strength_per_unit', 35, 0.5, 'troche_pack'),
('pessary', 'strength_per_unit', 35, 0.6, 'pessary_pack');

-- Seed: difficulty_rules
INSERT INTO public.difficulty_rules (tag, multiplier, description) VALUES
('standard', 1.00, 'Standard compounding complexity'),
('three_plus_actives', 1.15, 'Three or more active ingredients'),
('hazardous', 1.25, 'Hazardous, hormone or cytotoxic handling'),
('moulded', 1.20, 'Moulded dose forms (troches, pessaries)'),
('sterile', 1.50, 'Sterile or ophthalmic preparation'),
('hard_to_source', 1.10, 'Hard to source bulk API'),
('levigation', 1.15, 'Levigation or particle-size critical');

-- Seed: settings
INSERT INTO public.settings (key, value) VALUES
('hourly_rate', '80'::jsonb),
('prep_minutes', '20'::jsonb),
('markup', '1.236'::jsonb),
('gst_rate', '0.10'::jsonb),
('gst_default_taxable', 'false'::jsonb);

-- Seed: packaging_catalogue (modest starter set)
INSERT INTO public.packaging_catalogue (category, name, unit_cost_ex_gst) VALUES
('container', 'Ointment jar 30g', 0.95),
('container', 'Ointment jar 50g', 1.10),
('container', 'Ointment jar 100g', 1.40),
('container', 'Amber bottle 100mL', 1.20),
('container', 'Amber bottle 200mL', 1.65),
('container', 'Dropper bottle 30mL', 1.85),
('container', 'Capsule bottle (standard)', 0.60),
('closure', 'Standard cap', 0.15),
('label', 'Dispensary label', 0.10),
('device', 'Oral syringe 5mL', 0.45);
