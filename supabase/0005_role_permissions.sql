-- The secretary manages clinic settings, users, patient details, and the queue.
drop policy clinics_edit on public.clinics;
create policy clinics_edit on public.clinics for update
using (public.has_role(id, array['secretary'])) with check (public.has_role(id, array['secretary']));

drop policy patients_edit on public.patients;
create policy patients_edit on public.patients for update
using (public.has_role(clinic_id, array['secretary'])) with check (public.has_role(clinic_id, array['secretary']));

drop policy invites_team on public.invites;
create policy invites_team on public.invites for select
using (public.has_role(clinic_id, array['secretary']) or email = public.my_email());

create or replace function public.queue_next(p_clinic uuid)
returns public.display_queue language plpgsql security definer set search_path = public as $$
declare q display_queue; ref_seq int; b record; c clinics;
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  select * into q from display_queue where clinic_id = p_clinic and day = today_iq() for update;
  if not found then raise exception 'empty_queue'; end if;
  if q.updated_at > now() - interval '1 second' and q.cur >= 0 then return q; end if;
  if q.cur + 1 >= jsonb_array_length(q.items) then return q; end if;
  update display_queue set cur = cur + 1, version = version + 1, updated_at = now()
  where clinic_id = p_clinic and day = q.day returning * into q;
  perform _sync_status(q);

  -- تذكير القريبين قبل ساعة تقريباً، حسب التسلسل الأصلي
  select * into c from clinics where id = p_clinic;
  select bk.original_seq into ref_seq from bookings bk
   where bk.id = nullif(q.items -> q.cur ->> 'booking_id','')::uuid;
  if ref_seq is not null then
    for b in select bk.id, bk.original_seq, pt.id pid, pt.phone from bookings bk join patients pt on pt.id = bk.patient_id
             where bk.clinic_id = p_clinic and bk.day = q.day and bk.near and not bk.reminded and bk.status = 'waiting'
               and bk.original_seq between ref_seq + 1 and ref_seq + 4 loop
      update bookings set reminded = true where id = b.id;
      perform _msg(p_clinic, b.pid, b.phone, 'دورك قريب عند ' || c.doctor_name || '، باقي تقريباً ساعة. رقمك ' || b.original_seq || '.' || E'\n' ||
                   concat_ws('، ', nullif(c.building,''), nullif(c.room,'')));
    end loop;
  end if;
  return q;
end $$;

create or replace function public.cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bookings where id = p_booking and has_role(clinic_id, array['secretary'])) then
    raise exception 'forbidden';
  end if;
  perform _cancel(p_booking);
end $$;

create or replace function public.link_request(p_from uuid, p_to_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not has_role(p_from, array['secretary','doctor']) then raise exception 'forbidden'; end if;
  select id into t from clinics where slug = p_to_slug and id <> p_from;
  if t is null then raise exception 'clinic_not_found'; end if;
  insert into clinic_links (from_clinic, to_clinic) values (p_from, t)
  on conflict (from_clinic, to_clinic) do update set status = 'pending' where clinic_links.status = 'rejected';
end $$;

create or replace function public.invite_staff(p_clinic uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); uid uuid;
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_role not in ('doctor','secretary') then raise exception 'invalid_role'; end if;
  if e = my_email() then raise exception 'cannot_change_own_role'; end if;
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

create or replace function public.remove_staff(p_clinic uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_self'; end if;
  -- لازم يبقى مدير واحد على الأقل
  if (select count(*) from staff where clinic_id = p_clinic and role = 'secretary' and user_id <> p_user) = 0 then
    raise exception 'last_manager';
  end if;
  delete from staff where clinic_id = p_clinic and user_id = p_user;
  delete from invites where clinic_id = p_clinic and email = (select lower(email) from auth.users where id = p_user);
end $$;

create or replace function public.cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invites where id = p_invite and has_role(clinic_id, array['secretary'])) then raise exception 'forbidden'; end if;
  delete from invites where id = p_invite and accepted_at is null;
end $$;
