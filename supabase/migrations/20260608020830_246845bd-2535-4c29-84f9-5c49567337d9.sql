ALTER TABLE public.packaging_catalogue
  ADD COLUMN IF NOT EXISTS pack_key text,
  ADD COLUMN IF NOT EXISTS size_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS size_unit text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_packaging_pack_key ON public.packaging_catalogue (pack_key);

ALTER TABLE public.form_rules
  ADD COLUMN IF NOT EXISTS default_device_key text;