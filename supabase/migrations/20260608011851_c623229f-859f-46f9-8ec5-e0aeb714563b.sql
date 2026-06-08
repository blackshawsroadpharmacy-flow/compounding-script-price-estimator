
DROP POLICY IF EXISTS "ph_all" ON public.price_history;
DROP POLICY IF EXISTS "im_all" ON public.ingredients_master;
DROP POLICY IF EXISTS "pc_all" ON public.packaging_catalogue;
DROP POLICY IF EXISTS "dr_all" ON public.difficulty_rules;
DROP POLICY IF EXISTS "st_all" ON public.settings;
DROP POLICY IF EXISTS "q_all" ON public.quotes;
DROP POLICY IF EXISTS "fr_all" ON public.form_rules;

CREATE POLICY "im_select" ON public.ingredients_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "im_insert" ON public.ingredients_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "im_update" ON public.ingredients_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "im_delete" ON public.ingredients_master FOR DELETE TO authenticated USING (true);

CREATE POLICY "pc_select" ON public.packaging_catalogue FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pc_insert" ON public.packaging_catalogue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pc_update" ON public.packaging_catalogue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pc_delete" ON public.packaging_catalogue FOR DELETE TO authenticated USING (true);

CREATE POLICY "dr_select" ON public.difficulty_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "dr_insert" ON public.difficulty_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dr_update" ON public.difficulty_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dr_delete" ON public.difficulty_rules FOR DELETE TO authenticated USING (true);

CREATE POLICY "fr_select" ON public.form_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fr_insert" ON public.form_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fr_update" ON public.form_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fr_delete" ON public.form_rules FOR DELETE TO authenticated USING (true);

CREATE POLICY "st_select" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "st_insert" ON public.settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "st_update" ON public.settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "st_delete" ON public.settings FOR DELETE TO authenticated USING (true);

CREATE POLICY "ph_select" ON public.price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "ph_insert" ON public.price_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ph_update" ON public.price_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ph_delete" ON public.price_history FOR DELETE TO authenticated USING (true);

CREATE POLICY "q_select" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "q_insert" ON public.quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "q_update" ON public.quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "q_delete" ON public.quotes FOR DELETE TO authenticated USING (true);
