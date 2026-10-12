-- =====================================================================
-- 0004_storage.sql — Public bucket for generated images
--
-- AI providers return short-lived URLs (OpenAI/Replicate expire within
-- hours), and Instagram must fetch a stable public URL at publish time,
-- so every generated image is copied here. Uploads use the service role
-- only; reads are public.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-images', 'content-images', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
