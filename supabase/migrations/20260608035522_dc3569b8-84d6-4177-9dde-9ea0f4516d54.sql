
-- Drop anon SELECT policies left over from earlier dev access
DROP POLICY IF EXISTS dr_select ON public.difficulty_rules;
CREATE POLICY dr_select ON public.difficulty_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fr_select ON public.form_rules;
CREATE POLICY fr_select ON public.form_rules FOR SELECT TO authenticated USING (true);

-- Revoke any anon grants and ensure authenticated + service_role have full access
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'settings','ingredients_master','packaging_catalogue','form_rules',
    'difficulty_rules','price_history','formulations','quotes'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
