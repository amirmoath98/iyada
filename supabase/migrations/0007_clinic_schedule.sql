create table public.clinic_day_overrides (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  day date not null,
  state text not null check (state in ('closed', 'postponed')),
  moved_to date,
  primary key (clinic_id, day),
  check ((state = 'postponed' and moved_to is not null and moved_to > day) or
         (state = 'closed' and moved_to is null))
);
alter table public.clinic_day_overrides enable row level security;
alter table public.messages add column booking_id uuid references public.bookings(id) on delete set null;
alter table public.messages add column postponed_from date;
create index messages_waiting_booking on public.messages (booking_id)
  where status = 'queued' and booking_id is not null;
create index messages_postponed_day on public.messages (clinic_id, postponed_from)
  where postponed_from is not null;

-- Older versions only created queue rows for bookings made on the day of the visit.
insert into public.display_queue (clinic_id, day, items)
select b.clinic_id, b.day,
  jsonb_agg(jsonb_build_object('id', b.id, 'booking_id', b.id, 'name', p.name) order by b.original_seq)
from public.bookings b join public.patients p on p.id = b.patient_id
where b.day >= public.today_iq() and b.status = 'waiting'
group by b.clinic_id, b.day
on conflict do nothing;

create function public.clinic_schedule(p_slug text)
returns table(day date, booked int, capacity int, state text, moved_to date)
language sql stable security definer set search_path = public as $$
  select today_iq() + g.n, coalesce(b.n, 0), c.daily_limit,
    coalesce(o.state, case when coalesce(b.n, 0) >= c.daily_limit then 'full' else 'open' end),
    o.moved_to
  from clinics c
  cross join generate_series(0, 30) as g(n)
  left join clinic_day_overrides o on o.clinic_id = c.id and o.day = today_iq() + g.n
  left join (
    select bk.clinic_id, bk.day, count(*)::int as n from bookings bk
    join clinics match on match.id = bk.clinic_id and match.slug = p_slug
    where bk.day between today_iq() and today_iq() + 30 and bk.status <> 'cancelled'
    group by bk.clinic_id, bk.day
  ) b on b.clinic_id = c.id and b.day = today_iq() + g.n
  where c.slug = p_slug and c.kind = 'clinic'
  order by 1
$$;

create function public.set_clinic_day_open(p_clinic uuid, p_day date, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if p_day is null or p_open is null or p_day not between today_iq() and today_iq() + 30 then
    raise exception 'invalid_day';
  end if;
  perform 1 from clinics where id = p_clinic and kind = 'clinic' for update;
  if not found then raise exception 'clinic_not_found'; end if;
  if p_open then
    delete from clinic_day_overrides where clinic_id = p_clinic and day = p_day;
  else
    if exists (select 1 from bookings where clinic_id = p_clinic and day = p_day and status in ('waiting', 'in'))
    then raise exception 'day_has_bookings'; end if;
    insert into clinic_day_overrides (clinic_id, day, state) values (p_clinic, p_day, 'closed')
    on conflict do nothing;
  end if;
end $$;

create function public.postpone_clinic_day(p_clinic uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare
  c clinics;
  moved record;
  source_queue display_queue;
  moving int;
  target_count int;
  nseq int;
  new_items jsonb := '[]';
  destination date;
  notice text;
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_from < today_iq() or p_to <= p_from or p_to > today_iq() + 30
  then raise exception 'invalid_day'; end if;
  select * into c from clinics where id = p_clinic and kind = 'clinic' for update;
  if not found then raise exception 'clinic_not_found'; end if;
  select moved_to into destination from clinic_day_overrides where clinic_id = c.id and day = p_from;
  if destination is not null then
    if destination <> p_to then raise exception 'day_already_postponed'; end if;
    return (select count(*)::int from messages where clinic_id = c.id and postponed_from = p_from);
  end if;
  if exists (select 1 from clinic_day_overrides where clinic_id = c.id and day = p_to)
  then raise exception 'target_unavailable'; end if;

  select * into source_queue from display_queue where clinic_id = c.id and day = p_from for update;
  perform 1 from bookings where clinic_id = c.id and day in (p_from, p_to) order by day, id for update;
  select count(*) into moving from bookings where clinic_id = c.id and day = p_from and status = 'waiting';
  if moving = 0 then raise exception 'no_waiting_bookings'; end if;
  select count(*) filter (where status <> 'cancelled'), coalesce(max(original_seq), 0)
  into target_count, nseq from bookings where clinic_id = c.id and day = p_to;
  if target_count + moving > c.daily_limit then raise exception 'target_capacity'; end if;
  if exists (
    select 1 from bookings a join bookings z on a.patient_id = z.patient_id and a.clinic_id = z.clinic_id
    where a.clinic_id = c.id and a.day = p_from and a.status = 'waiting'
      and z.day = p_to and z.status <> 'cancelled'
  ) then raise exception 'target_duplicate'; end if;

  for moved in
    select b.*, p.phone, p.name from bookings b join patients p on p.id = b.patient_id
    where b.clinic_id = c.id and b.day = p_from and b.status = 'waiting' order by b.original_seq
  loop
    nseq := nseq + 1;
    update bookings set day = p_to, original_seq = nseq, reminded = false, confirmed = null where id = moved.id;
    new_items := new_items || jsonb_build_array(jsonb_build_object('id', moved.id, 'booking_id', moved.id, 'name', moved.name));

    -- Supersede queued confirmations and reminders; sent messages remain in history.
    update messages set status = 'failed', error = 'superseded by reschedule'
    where clinic_id = c.id and patient_id = moved.patient_id and direction = 'out' and status = 'queued'
      and (booking_id = moved.id or (
        booking_id is null and (
          (body like ('تم تأكيد حجزك ✓' || E'\nرقمك ' || moved.original_seq || ' — %')
            and send_after between moved.created_at - interval '2 seconds' and moved.created_at + interval '2 seconds')
          or (body like 'صباح الخير، حجزك اليوم عند %' and body like ('%، رقمك ' || moved.original_seq || '، والوقت التقريبي %')
            and (send_after at time zone 'Asia/Baghdad')::date = p_from)
        )
      ));
    notice := 'تم تأجيل موعدك لدى ' || c.name || ' من ' || p_from || ' إلى ' || p_to ||
      ' بسبب ظرف طارئ. رقم حجزك الجديد ' || nseq || '، ورابط المتابعة نفسه.';
    insert into messages (clinic_id, patient_id, booking_id, phone, body, postponed_from)
    values (c.id, moved.patient_id, moved.id, moved.phone, notice, p_from);
  end loop;

  if source_queue.clinic_id is not null then
    update display_queue set items = coalesce((
      select jsonb_agg(item order by seq)
      from jsonb_array_elements(source_queue.items) with ordinality q(item, seq)
      where seq <= source_queue.cur + 1
    ), '[]'::jsonb), version = version + 1, updated_at = now()
    where clinic_id = c.id and day = p_from;
  end if;
  insert into display_queue (clinic_id, day, items) values (c.id, p_to, new_items)
  on conflict (clinic_id, day) do update
    set items = display_queue.items || excluded.items,
        version = display_queue.version + 1, updated_at = now();
  insert into clinic_day_overrides (clinic_id, day, state, moved_to) values (c.id, p_from, 'postponed', p_to)
  on conflict (clinic_id, day) do update set state = excluded.state, moved_to = excluded.moved_to;
  return moving;
end $$;

create function public.clinic_postponement_messages(p_clinic uuid, p_day date)
returns table(id uuid, name text, phone text, body text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  return query
    select m.id, p.name, m.phone, m.body, m.status
    from messages m join patients p on p.id = m.patient_id
    where m.clinic_id = p_clinic and m.postponed_from = p_day
      and m.error is distinct from 'superseded by reschedule'
    order by m.created_at, p.name, m.id;
end $$;

revoke all on function public.clinic_schedule(text), public.set_clinic_day_open(uuid,date,boolean),
  public.postpone_clinic_day(uuid,date,date), public.clinic_postponement_messages(uuid,date) from public, anon, authenticated;
grant execute on function public.clinic_schedule(text) to anon, authenticated;
grant execute on function public.set_clinic_day_open(uuid,date,boolean), public.postpone_clinic_day(uuid,date,date),
  public.clinic_postponement_messages(uuid,date) to authenticated;

create or replace function public.book_appointment(
  p_slug text, p_name text, p_phone text, p_gov text, p_area text, p_type text,
  p_complaint text default '', p_answers jsonb default '{}', p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c clinics; d date; ph text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        nm text := trim(coalesce(p_name,'')); pid uuid; b bookings; availability text; nseq int; t date := today_iq();
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

  select state into availability from clinic_schedule(c.slug) where day = d;
  if availability is distinct from 'open' then
    return jsonb_build_object('full', true, 'reason', availability, 'next_day',
      (select min(day) from clinic_schedule(c.slug) where state = 'open' and day > d));
  end if;

  if exists (select 1 from bookings bk join patients pt on pt.id = bk.patient_id
             where bk.clinic_id = c.id and bk.day = d and bk.status <> 'cancelled'
               and pt.phone = ph and pt.name = nm) then
    raise exception 'already_booked';
  end if;

  insert into patients (clinic_id, name, phone, gov, area) values (c.id, nm, ph, coalesce(p_gov,''), coalesce(p_area,''))
  on conflict (clinic_id, phone, name) do update set gov = excluded.gov, area = excluded.area
  returning id into pid;

  select coalesce(max(original_seq), 0) + 1 into nseq from bookings where clinic_id = c.id and day = d;
  insert into bookings (clinic_id, patient_id, day, original_seq, type, near, complaint, answers)
  values (c.id, pid, d, nseq, p_type, (p_gov = c.gov and p_area = any(c.near_areas)),
          left(coalesce(p_complaint,''), 2000), coalesce(p_answers, '{}'))
  returning * into b;

  insert into display_queue (clinic_id, day, items) values (c.id, d, '[]') on conflict do nothing;
  update display_queue set items = items || jsonb_build_array(jsonb_build_object('id', b.id, 'booking_id', b.id, 'name', nm)),
         version = version + 1, updated_at = now()
  where clinic_id = c.id and day = d;

  est := booking_est(b);
  when_txt := case when d = t then 'اليوم' when d = t + 1 then 'باچر' else to_char(d, 'YYYY-MM-DD') end;
  perform _msg(c.id, pid, ph, 'تم تأكيد حجزك ✓' || E'\nرقمك ' || nseq || ' — ' || when_txt || '، الوقت التقريبي ' || to_char(est, 'HH12:MI') ||
               E'\n' || clinic_address(c));
  if not b.near then
    perform _msg(c.id, pid, ph, 'صباح الخير، حجزك اليوم عند ' || c.doctor_name || '، رقمك ' || nseq || '، والوقت التقريبي ' || to_char(est, 'HH12:MI') ||
                 E'\nرد 1 للتأكيد أو 2 للإلغاء.',
                 greatest(now(), (d + time '08:00') at time zone 'Asia/Baghdad'));
  end if;
  update messages set booking_id = b.id
  where clinic_id = c.id and patient_id = pid and booking_id is null and created_at = now()
    and direction = 'out' and (body like 'تم تأكيد حجزك ✓%' or body like 'صباح الخير، حجزك اليوم عند %');
  return jsonb_build_object('full', false, 'token', b.token, 'seq', nseq, 'day', d, 'est', to_char(est, 'HH24:MI'));
end $$;
