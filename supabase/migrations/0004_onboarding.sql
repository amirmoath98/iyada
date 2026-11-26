-- عيادة: التسجيل الذاتي. السكرتير يسجّل العيادة ويصير مديرها، ويدعو الطبيب بالبريد.
-- الطبيب يگدر يدير الفريق هم، حتى ما تنقفل العيادة إذا ترك السكرتير.

alter table public.staff add column if not exists email text;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role text not null check (role in ('doctor','secretary','partner')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (clinic_id, email)
);
alter table public.invites enable row level security;

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- الفريق يشوف بعضه، والإدارة للسكرتير والطبيب
drop policy if exists staff_team on staff;
create policy staff_team on staff for select using (has_role(clinic_id, array['doctor','secretary','partner']));
create policy invites_team on invites for select using (has_role(clinic_id, array['doctor','secretary']) or email = my_email());

-- ===== تسجيل عيادة جديدة: اللي يسجّل يصير السكرتير (المدير) =====
create or replace function public.register_clinic(p_slug text, p_kind text, p_name text, p_doctor_name text,
  p_specialty text, p_phone text, p_gov text, p_area text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; s text := lower(trim(p_slug));
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if s !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid_slug'; end if;
  if exists (select 1 from clinics where slug = s) then raise exception 'slug_taken'; end if;
  if coalesce(p_kind,'clinic') not in ('clinic','radiology','lab','pharmacy') then raise exception 'invalid_kind'; end if;
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
grant execute on function public.register_clinic to authenticated;

-- ===== دعوة طبيب أو سكرتير ثاني بالبريد =====
create or replace function public.invite_staff(p_clinic uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); uid uuid;
begin
  if not has_role(p_clinic, array['secretary','doctor']) then raise exception 'forbidden'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_role not in ('doctor','secretary') then raise exception 'invalid_role'; end if;
  insert into invites (clinic_id, email, role, created_by) values (p_clinic, e, p_role, auth.uid())
  on conflict (clinic_id, email) do update set role = excluded.role, accepted_at = null, created_by = auth.uid();
  -- إذا عنده حساب أصلاً، ينربط مباشرة
  select id into uid from auth.users where lower(email) = e and email_confirmed_at is not null;
  if uid is not null then
    insert into staff (user_id, clinic_id, role, email) values (uid, p_clinic, p_role, e)
    on conflict (user_id, clinic_id) do update set role = excluded.role;
    update invites set accepted_at = now() where clinic_id = p_clinic and email = e;
  end if;
end $$;
grant execute on function public.invite_staff to authenticated;

-- ===== عند الدخول: يقبل الدعوات اللي على بريده (بس إذا البريد مؤكَّد) =====
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; inv record; e text := my_email();
begin
  if auth.uid() is null or e = '' then return 0; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then return 0; end if;
  for inv in select * from invites where email = e and accepted_at is null loop
    insert into staff (user_id, clinic_id, role, email) values (auth.uid(), inv.clinic_id, inv.role, e)
    on conflict (user_id, clinic_id) do update set role = excluded.role;
    update invites set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.claim_invites to authenticated;

-- ===== إزالة عضو أو إلغاء دعوة =====
create or replace function public.remove_staff(p_clinic uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary','doctor']) then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_self'; end if;
  -- لازم يبقى مدير واحد على الأقل
  if (select count(*) from staff where clinic_id = p_clinic and role in ('secretary','doctor') and user_id <> p_user) = 0 then
    raise exception 'last_manager';
  end if;
  delete from staff where clinic_id = p_clinic and user_id = p_user;
  delete from invites where clinic_id = p_clinic and email = (select lower(email) from auth.users where id = p_user);
end $$;
grant execute on function public.remove_staff to authenticated;

create or replace function public.cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invites where id = p_invite and has_role(clinic_id, array['secretary','doctor'])) then raise exception 'forbidden'; end if;
  delete from invites where id = p_invite and accepted_at is null;
end $$;
grant execute on function public.cancel_invite to authenticated;

-- العيادات المرتبطة (أشعة، مختبر، صيدلية) تعدّل معلوماتها هم
drop policy if exists clinics_edit_partner on clinics;
create policy clinics_edit_partner on clinics for update using (has_role(id, array['partner'])) with check (has_role(id, array['partner']));
