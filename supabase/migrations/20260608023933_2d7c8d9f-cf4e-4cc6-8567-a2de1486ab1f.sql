
DROP POLICY IF EXISTS im_select ON public.ingredients_master;
CREATE POLICY im_select ON public.ingredients_master FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pc_select ON public.packaging_catalogue;
CREATE POLICY pc_select ON public.packaging_catalogue FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS st_select ON public.settings;
CREATE POLICY st_select ON public.settings FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.ingredients_master FROM anon;
REVOKE ALL ON public.packaging_catalogue FROM anon;
REVOKE ALL ON public.settings FROM anon;
