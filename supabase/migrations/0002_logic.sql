-- عيادتي: الصلاحيات (RLS) ودوال الحجز والدور والإحالات

-- ===== أدوات مساعدة =====
create or replace function public.today_iq() returns date
language sql stable as $$ select (now() at time zone 'Asia/Baghdad')::date $$;

create or replace function public.has_role(c uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and clinic_id = c and role = any(roles))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function public.booking_est(b public.bookings) returns time
language sql stable security definer set search_path = public as $$
  select c.open_time + make_interval(mins => coalesce(sum((c.durations ->> x.type)::int), 0)::int)
  from clinics c
  left join bookings x on x.clinic_id = b.clinic_id and x.day = b.day
       and x.original_seq < b.original_seq and x.status <> 'cancelled'
  where c.id = b.clinic_id
  group by c.open_time
$$;

create or replace function public.clinic_address(c public.clinics) returns text
language sql immutable as $$
  select c.doctor_name || ' — ' || c.name || E'\n' ||
         concat_ws('، ', nullif(c.building,''), nullif(c.floor,''), nullif(c.room,'')) || E'\n' ||
         concat_ws(' · ', nullif(c.area || case when c.gov <> '' then '، ' || c.gov else '' end, ''), nullif(c.landmark,'')) ||
         case when c.map_url <> '' then E'\nالخريطة: ' || c.map_url else '' end ||
         case when c.phone <> '' then E'\nتلفون العيادة: ' || c.phone else '' end
$$;

create or replace function public._msg(c uuid, p uuid, ph text, body text, after timestamptz default now())
returns void language sql security definer set search_path = public as $$
  insert into messages (clinic_id, patient_id, phone, body, send_after) values (c, p, ph, body, after)
$$;
revoke all on function public._msg from public, anon, authenticated;

-- يزامن حالات الحجوزات ويا ترتيب الشاشة
create or replace function public._sync_status(q public.display_queue)
returns void language plpgsql security definer set search_path = public as $$
declare i int := 0; it jsonb;
begin
  for it in select value from jsonb_array_elements(q.items) loop
    if it ->> 'booking_id' is not null then
      update bookings set status = case when i < q.cur then 'done' when i = q.cur then 'in' else 'waiting' end
      where id = (it ->> 'booking_id')::uuid and clinic_id = q.clinic_id and status <> 'cancelled';
    end if;
    i := i + 1;
  end loop;
end $$;
revoke all on function public._sync_status from public, anon, authenticated;

-- ===== الحجز (المريض من الرابط، أو السكرتير) =====
create or replace function public.book_appointment(
  p_slug text, p_name text, p_phone text, p_gov text, p_area text, p_type text,
  p_complaint text default '', p_answers jsonb default '{}', p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c clinics; d date; ph text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        nm text := trim(coalesce(p_name,'')); pid uuid; b bookings; cnt int; nseq int; t date := today_iq();
        when_txt text; est time;
begin
  if length(ph) = 10 and left(ph,1) = '7' then ph := '0' || ph; end if;
  if ph !~ '^07[0-9]{9}$' then raise exception 'invalid_phone'; end if;
  if length(nm) < 2 then raise exception 'invalid_name'; end if;
  if p_type not in ('new','follow','surgery','postop') then raise exception 'invalid_type'; end if;
  select * into c from clinics where slug = p_slug and kind = 'clinic' for update;
  if not found then raise exception 'clinic_not_found'; end if;
  d := coalesce(p_day, t);
  if d < t or d > t + 30 then raise exception 'invalid_day'; end if;

  if exists (select 1 from bookings bk join patients pt on pt.id = bk.patient_id
             where bk.clinic_id = c.id and bk.day = d and bk.status <> 'cancelled'
               and pt.phone = ph and pt.name = nm) then
    raise exception 'already_booked';
  end if;

  select count(*) into cnt from bookings where clinic_id = c.id and day = d and status <> 'cancelled';
  if cnt >= c.daily_limit then
    return jsonb_build_object('full', true, 'next_day', d + 1);
  end if;

  insert into patients (clinic_id, name, phone, gov, area) values (c.id, nm, ph, coalesce(p_gov,''), coalesce(p_area,''))
  on conflict (clinic_id, phone, name) do update set gov = excluded.gov, area = excluded.area
  returning id into pid;

  select coalesce(max(original_seq), 0) + 1 into nseq from bookings where clinic_id = c.id and day = d;
  insert into bookings (clinic_id, patient_id, day, original_seq, type, near, complaint, answers)
  values (c.id, pid, d, nseq, p_type, (p_gov = c.gov and p_area = any(c.near_areas)),
          left(coalesce(p_complaint,''), 2000), coalesce(p_answers, '{}'))
  returning * into b;

  if d = t then
    insert into display_queue (clinic_id, day, items) values (c.id, d, '[]') on conflict do nothing;
    update display_queue set items = items || jsonb_build_array(jsonb_build_object('id', b.id, 'booking_id', b.id, 'name', nm)),
           version = version + 1, updated_at = now()
    where clinic_id = c.id and day = d;
  end if;

  est := booking_est(b);
  when_txt := case when d = t then 'اليوم' when d = t + 1 then 'باچر' else to_char(d, 'YYYY-MM-DD') end;
  perform _msg(c.id, pid, ph, 'تم تأكيد حجزك ✓' || E'\nرقمك ' || nseq || ' — ' || when_txt || '، الوقت التقريبي ' || to_char(est, 'HH12:MI') ||
               E'\n' || clinic_address(c));
  if not b.near then
    perform _msg(c.id, pid, ph, 'صباح الخير، حجزك اليوم عند ' || c.doctor_name || '، رقمك ' || nseq || '، والوقت التقريبي ' || to_char(est, 'HH12:MI') ||
                 E'\nرد 1 للتأكيد أو 2 للإلغاء.',
                 greatest(now(), (d + time '08:00') at time zone 'Asia/Baghdad'));
  end if;
  return jsonb_build_object('full', false, 'token', b.token, 'seq', nseq, 'day', d, 'est', to_char(est, 'HH24:MI'));
end $$;
grant execute on function public.book_appointment to anon, authenticated;

-- ===== «التالي»: يتبع ترتيب الشاشة، ضغطة وحدة بالثانية =====
create or replace function public.queue_next(p_clinic uuid)
returns public.display_queue language plpgsql security definer set search_path = public as $$
declare q display_queue; ref_seq int; b record; c clinics;
begin
  if not has_role(p_clinic, array['secretary','doctor']) then raise exception 'forbidden'; end if;
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
grant execute on function public.queue_next to authenticated;

-- ===== تقديم، تأخير، إضافة اسم، تأجيل، تراجع =====
create or replace function public.queue_set(p_clinic uuid, p_items jsonb, p_cur int, p_version int)
returns public.display_queue language plpgsql security definer set search_path = public as $$
declare q display_queue; it jsonb;
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  select * into q from display_queue where clinic_id = p_clinic and day = today_iq() for update;
  if not found then raise exception 'empty_queue'; end if;
  if q.version <> p_version then raise exception 'conflict'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_queue'; end if;
  if p_cur < -1 or p_cur >= jsonb_array_length(p_items) then raise exception 'invalid_queue'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    if coalesce(it ->> 'name','') = '' or length(it ->> 'name') > 80 then raise exception 'invalid_queue'; end if;
    if it ->> 'booking_id' is not null and not exists (
      select 1 from bookings where id = (it ->> 'booking_id')::uuid and clinic_id = p_clinic and day = q.day) then
      raise exception 'invalid_queue';
    end if;
  end loop;
  update display_queue set items = p_items, cur = p_cur, version = version + 1, updated_at = now()
  where clinic_id = p_clinic and day = q.day returning * into q;
  perform _sync_status(q);
  return q;
end $$;
grant execute on function public.queue_set to authenticated;

create or replace function public._cancel(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; c clinics; pt patients;
begin
  select * into b from bookings where id = p_booking;
  if not found then raise exception 'not_found'; end if;
  update bookings set status = 'cancelled' where id = p_booking;
  update display_queue q set items = coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(q.items) with ordinality t(e, o)
                                              where e ->> 'booking_id' is distinct from p_booking::text or o - 1 <= q.cur), '[]'),
         version = version + 1, updated_at = now()
  where q.clinic_id = b.clinic_id and q.day = b.day;
  select * into c from clinics where id = b.clinic_id;
  select * into pt from patients where id = b.patient_id;
  perform _msg(c.id, pt.id, pt.phone, 'انلغى حجزك رقم ' || b.original_seq || ' عند ' || c.doctor_name || '.');
end $$;
revoke all on function public._cancel from public, anon, authenticated;

create or replace function public.cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bookings where id = p_booking and has_role(clinic_id, array['secretary','doctor'])) then
    raise exception 'forbidden';
  end if;
  perform _cancel(p_booking);
end $$;
grant execute on function public.cancel_booking to authenticated;

-- للواتساب (المريض يرد 2): يشتغل بس بمفتاح الخدمة
create or replace function public.cancel_booking_service(p_booking uuid)
returns void language sql security definer set search_path = public as $$ select _cancel(p_booking) $$;
revoke all on function public.cancel_booking_service from public, anon, authenticated;
grant execute on function public.cancel_booking_service to service_role;

-- ===== صفحات عامة بدون تسجيل دخول =====
create or replace function public.track_booking(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', pt.name, 'seq', b.original_seq, 'day', b.day, 'type', b.type, 'status', b.status,
    'est', to_char(booking_est(b), 'HH24:MI'),
    'ahead', (select greatest(o - 2 - q.cur, 0) from display_queue q, jsonb_array_elements(q.items) with ordinality t(e, o)
              where q.clinic_id = b.clinic_id and q.day = b.day and e ->> 'booking_id' = b.id::text),
    'clinic', jsonb_build_object('name', c.name, 'doctor', c.doctor_name, 'address', clinic_address(c), 'slug', c.slug))
  from bookings b join patients pt on pt.id = b.patient_id join clinics c on c.id = b.clinic_id
  where b.token = p_token
$$;
grant execute on function public.track_booking to anon, authenticated;

-- شاشة المراجعين: اسم الداخل بس
create or replace function public.display_now(p_clinic uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('clinic', c.name, 'doctor', c.doctor_name, 'specialty', c.specialty, 'logo_path', c.logo_path,
    'name', (select q.items -> q.cur ->> 'name' from display_queue q where q.clinic_id = c.id and q.day = today_iq() and q.cur >= 0),
    'version', (select q.version from display_queue q where q.clinic_id = c.id and q.day = today_iq()))
  from clinics c where c.id = p_clinic
$$;
grant execute on function public.display_now to anon, authenticated;

-- ===== السجل الطبي =====
create or replace function public.save_record(p_booking uuid, p_diagnosis text, p_prescription text,
  p_surgery jsonb, p_follow_up text, p_send_rx boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; c clinics; pt patients; old_follow text;
begin
  select * into b from bookings where id = p_booking;
  if not found or not has_role(b.clinic_id, array['doctor']) then raise exception 'forbidden'; end if;
  select follow_up into old_follow from medical_records where booking_id = p_booking;
  insert into medical_records (booking_id, clinic_id, patient_id, diagnosis, prescription, surgery, follow_up, updated_at)
  values (p_booking, b.clinic_id, b.patient_id, coalesce(p_diagnosis,''), coalesce(p_prescription,''), p_surgery, coalesce(p_follow_up,''), now())
  on conflict (booking_id) do update set diagnosis = excluded.diagnosis, prescription = excluded.prescription,
     surgery = excluded.surgery, follow_up = excluded.follow_up, updated_at = now();
  select * into c from clinics where id = b.clinic_id;
  select * into pt from patients where id = b.patient_id;
  if coalesce(p_follow_up,'') <> '' and p_follow_up is distinct from old_follow then
    perform _msg(c.id, pt.id, pt.phone, 'الطبيب حدد مراجعتك الجاية ' || p_follow_up || '. راح نذكرك قبل الموعد.');
  end if;
  if p_send_rx and coalesce(p_prescription,'') <> '' then
    perform _msg(c.id, pt.id, pt.phone, 'وصفتك من ' || c.doctor_name || E':\n' || p_prescription);
  end if;
end $$;
grant execute on function public.save_record to authenticated;

-- ===== الربط بين العيادات =====
create or replace function public.link_request(p_from uuid, p_to_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not has_role(p_from, array['secretary']) then raise exception 'forbidden'; end if;
  select id into t from clinics where slug = p_to_slug;
  if t is null then raise exception 'clinic_not_found'; end if;
  insert into clinic_links (from_clinic, to_clinic) values (p_from, t)
  on conflict (from_clinic, to_clinic) do update set status = 'pending' where clinic_links.status = 'rejected';
end $$;
grant execute on function public.link_request to authenticated;

create or replace function public.link_respond(p_link uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l clinic_links;
begin
  select * into l from clinic_links where id = p_link;
  if not found or not has_role(l.to_clinic, array['secretary','doctor','partner']) then raise exception 'forbidden'; end if;
  update clinic_links set status = case when p_accept then 'accepted' else 'rejected' end where id = p_link;
end $$;
grant execute on function public.link_respond to authenticated;

create or replace function public.link_remove(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l clinic_links;
begin
  select * into l from clinic_links where id = p_link;
  if not found or not (has_role(l.from_clinic, array['secretary','doctor']) or has_role(l.to_clinic, array['secretary','doctor','partner'])) then
    raise exception 'forbidden';
  end if;
  delete from clinic_links where id = p_link;
end $$;
grant execute on function public.link_remove to authenticated;

-- ===== الإحالات =====
create or replace function public.refer(p_booking uuid, p_to uuid, p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; pt patients; t clinics; c clinics;
begin
  select * into b from bookings where id = p_booking;
  if not found or not has_role(b.clinic_id, array['doctor']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from clinic_links where from_clinic = b.clinic_id and to_clinic = p_to and status = 'accepted') then
    raise exception 'not_linked';
  end if;
  select * into pt from patients where id = b.patient_id;
  select * into t from clinics where id = p_to;
  select * into c from clinics where id = b.clinic_id;
  insert into referrals (from_clinic, to_clinic, booking_id, patient_id, patient_name, what)
  values (b.clinic_id, p_to, b.id, pt.id, pt.name, trim(p_what));
  perform _msg(c.id, pt.id, pt.phone, c.doctor_name || ' حوّلك إلى ' || t.name || E'\nالمطلوب: ' || trim(p_what) || E'\n' || clinic_address(t));
end $$;
grant execute on function public.refer to authenticated;

create or replace function public.referral_result(p_ref uuid, p_result text)
returns void language plpgsql security definer set search_path = public as $$
declare r referrals; pt patients; c clinics;
begin
  select * into r from referrals where id = p_ref;
  if not found or not has_role(r.to_clinic, array['secretary','doctor','partner']) then raise exception 'forbidden'; end if;
  update referrals set result = trim(p_result), result_at = now() where id = p_ref;
  select * into pt from patients where id = r.patient_id;
  select * into c from clinics where id = r.from_clinic;
  perform _msg(c.id, pt.id, pt.phone, 'نتيجتك وصلت لـ' || c.doctor_name || E'. نسخة منها:\n' || trim(p_result));
end $$;
grant execute on function public.referral_result to authenticated;

-- ===== مرفقات المريض من رابط الحجز =====
create or replace function public.attach_by_token(p_token text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where token = p_token;
  if not found then raise exception 'not_found'; end if;
  if p_path not like 'incoming/' || p_token || '/%' then raise exception 'invalid_path'; end if;
  if (select count(*) from attachments where booking_id = b.id) >= 10 then raise exception 'too_many'; end if;
  insert into attachments (clinic_id, patient_id, booking_id, path, source) values (b.clinic_id, b.patient_id, b.id, p_path, 'patient');
end $$;
grant execute on function public.attach_by_token to anon, authenticated;

-- ===== RLS =====
alter table clinics enable row level security;
alter table staff enable row level security;
alter table admins enable row level security;
alter table patients enable row level security;
alter table bookings enable row level security;
alter table display_queue enable row level security;
alter table medical_records enable row level security;
alter table attachments enable row level security;
alter table clinic_links enable row level security;
alter table referrals enable row level security;
alter table messages enable row level security;

-- معلومات العيادة عامة (صفحة العيادة)، والتعديل لطاقمها
create policy clinics_read on clinics for select using (true);
create policy clinics_edit on clinics for update using (has_role(id, array['doctor','secretary'])) with check (has_role(id, array['doctor','secretary']));
create policy clinics_admin on clinics for all using (is_admin()) with check (is_admin());

create policy staff_self on staff for select using (user_id = auth.uid() or is_admin());
create policy staff_admin on staff for all using (is_admin()) with check (is_admin());
create policy admins_self on admins for select using (user_id = auth.uid());

-- المرضى والحجوزات: الطبيب والسكرتير، والعيادة المرتبطة تشوف بس اللي انحال إلها
create policy patients_staff on patients for select using (has_role(clinic_id, array['doctor','secretary']));
create policy patients_partner on patients for select using (exists (select 1 from referrals r where r.patient_id = patients.id and has_role(r.to_clinic, array['partner','doctor','secretary'])));
create policy patients_edit on patients for update using (has_role(clinic_id, array['doctor','secretary']));

create policy bookings_staff on bookings for select using (has_role(clinic_id, array['doctor','secretary']));
create policy queue_staff on display_queue for select using (has_role(clinic_id, array['doctor','secretary']));

-- السجل الطبي: الطبيب بس (السكرتير ما يوصله)
create policy records_doctor on medical_records for select using (has_role(clinic_id, array['doctor']));

create policy att_doctor on attachments for select using (has_role(clinic_id, array['doctor']));
create policy att_secretary_add on attachments for insert with check (has_role(clinic_id, array['doctor','secretary']));

create policy links_read on clinic_links for select using (has_role(from_clinic, array['doctor','secretary','partner']) or has_role(to_clinic, array['doctor','secretary','partner']));

create policy refs_from on referrals for select using (has_role(from_clinic, array['doctor']));
create policy refs_to on referrals for select using (has_role(to_clinic, array['doctor','secretary','partner']));

create policy msgs_staff on messages for select using (has_role(clinic_id, array['doctor','secretary']));

-- ===== التخزين: مرفقات خاصة =====
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict do nothing;

create policy att_upload_patient on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'attachments' and name like 'incoming/%');
create policy att_upload_staff on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and name like 'clinic/%');
create policy att_read_doctor on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (select 1 from public.attachments a where a.path = storage.objects.name and public.has_role(a.clinic_id, array['doctor'])));
create policy logos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.has_role(((storage.foldername(name))[1])::uuid, array['doctor','secretary']));

-- ===== التحديث المباشر =====
alter publication supabase_realtime add table public.display_queue, public.bookings, public.referrals, public.clinic_links, public.medical_records;
