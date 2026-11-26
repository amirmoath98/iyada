insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referral-media', 'referral-media', false, 31457280, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'
]);

create function public.can_access_referral_media(p_object text, p_upload boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_object ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]+\.[a-z0-9]+$' then
      exists (
        select 1 from public.referrals r
        where r.id = pg_catalog.split_part(p_object, '/', 1)::uuid
          and (
            public.has_role(r.to_clinic, array['doctor', 'partner'])
            or (not p_upload and public.has_role(r.from_clinic, array['doctor']))
          )
      )
    else false
  end
$$;

revoke all on function public.can_access_referral_media(text,boolean) from public, anon, authenticated;
grant execute on function public.can_access_referral_media(text,boolean) to authenticated;

create policy referral_media_read on storage.objects for select to authenticated
using (bucket_id = 'referral-media' and public.can_access_referral_media(name, false));

create policy referral_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'referral-media' and public.can_access_referral_media(name, true));
