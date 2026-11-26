create or replace function public.register_clinic(p_slug text, p_kind text, p_name text, p_doctor_name text,
  p_specialty text, p_phone text, p_gov text, p_area text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; s text := lower(trim(p_slug)); account_kind text;
begin
  select raw_user_meta_data ->> 'account_kind' into account_kind
  from auth.users where id = auth.uid() and email_confirmed_at is not null for update;
  if not found then raise exception 'forbidden'; end if;
  if account_kind is not null and account_kind is distinct from p_kind then raise exception 'separate_account'; end if;
  if exists (select 1 from staff where user_id = auth.uid() and role <> case when p_kind = 'clinic' then 'secretary' else 'partner' end)
  then raise exception 'separate_account'; end if;
  if s !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid_slug'; end if;
  if exists (select 1 from clinics where slug = s) then raise exception 'slug_taken'; end if;
  if p_kind is null or p_kind not in ('clinic','radiology','lab','pharmacy') then raise exception 'invalid_kind'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'invalid_name'; end if;
  if (select count(*) from staff where user_id = auth.uid()) >= 5 then raise exception 'too_many'; end if;
  insert into clinics (slug, kind, name, doctor_name, specialty, phone, gov, area)
  values (s, coalesce(p_kind,'clinic'), trim(p_name), trim(coalesce(p_doctor_name,'')), trim(coalesce(p_specialty,'')),
          trim(coalesce(p_phone,'')), coalesce(p_gov,''), coalesce(p_area,''))
  returning id into cid;
  insert into staff (user_id, clinic_id, role, email)
  values (auth.uid(), cid, case when p_kind = 'clinic' then 'secretary' else 'partner' end, my_email());
  return cid;
end $$;

create or replace function public.invite_staff(p_clinic uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); uid uuid;
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_role is distinct from 'doctor' then raise exception 'invalid_role'; end if;
  if e = my_email() then raise exception 'cannot_change_own_role'; end if;
  select id into uid from auth.users where lower(email) = e and email_confirmed_at is not null for update;
  if uid is not null and (
    exists (select 1 from staff where user_id = uid and role <> 'doctor')
    or exists (select 1 from auth.users where id = uid and coalesce(raw_user_meta_data ->> 'account_kind', 'doctor') <> 'doctor')
  ) then raise exception 'separate_account'; end if;
  insert into invites (clinic_id, email, role, created_by) values (p_clinic, e, p_role, auth.uid())
  on conflict (clinic_id, email) do update set role = excluded.role, accepted_at = null, created_by = auth.uid();
  if uid is not null then
    insert into staff (user_id, clinic_id, role, email) values (uid, p_clinic, p_role, e)
    on conflict (user_id, clinic_id) do nothing;
    update invites set accepted_at = now() where clinic_id = p_clinic and email = e;
  end if;
end $$;

create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; inv record; e text := my_email(); account_kind text;
begin
  if auth.uid() is null or e = '' then return 0; end if;
  select raw_user_meta_data ->> 'account_kind' into account_kind
  from auth.users where id = auth.uid() and email_confirmed_at is not null for update;
  if not found then return 0; end if;
  for inv in select * from invites where email = e and accepted_at is null order by created_at, id for update loop
    if account_kind is not null and (account_kind <> 'doctor' or inv.role <> 'doctor') then continue; end if;
    if exists (select 1 from staff where user_id = auth.uid() and role <> inv.role) then continue; end if;
    insert into staff (user_id, clinic_id, role, email) values (auth.uid(), inv.clinic_id, inv.role, e)
    on conflict (user_id, clinic_id) do nothing;
    update invites set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.link_request(p_from uuid, p_to_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not has_role(p_from, array['secretary']) then raise exception 'forbidden'; end if;
  select id into t from clinics where slug = p_to_slug and id <> p_from and kind in ('radiology','lab','pharmacy');
  if t is null then raise exception 'clinic_not_found'; end if;
  insert into clinic_links (from_clinic, to_clinic) values (p_from, t)
  on conflict (from_clinic, to_clinic) do update set status = 'pending' where clinic_links.status = 'rejected';
end $$;

create or replace function public.link_respond(p_link uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l clinic_links;
begin
  select * into l from clinic_links where id = p_link;
  if not found or not has_role(l.to_clinic, array['secretary','partner']) then raise exception 'forbidden'; end if;
  update clinic_links set status = case when p_accept then 'accepted' else 'rejected' end where id = p_link;
end $$;

create or replace function public.link_remove(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l clinic_links;
begin
  select * into l from clinic_links where id = p_link;
  if not found or not (has_role(l.from_clinic, array['secretary']) or has_role(l.to_clinic, array['secretary','partner'])) then
    raise exception 'forbidden';
  end if;
  delete from clinic_links where id = p_link;
end $$;

create function public.invite_clinic_doctor(p_clinic uuid, p_email text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'invalid_name'; end if;
  perform invite_staff(p_clinic, p_email, 'doctor');
  update clinics set doctor_name = trim(p_name) where id = p_clinic and kind = 'clinic';
  if not found then raise exception 'forbidden'; end if;
end $$;

revoke all on function public.invite_clinic_doctor(uuid, text, text) from public, anon, authenticated;
grant execute on function public.invite_clinic_doctor(uuid, text, text) to authenticated;
