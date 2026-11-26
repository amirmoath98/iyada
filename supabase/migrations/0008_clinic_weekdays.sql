-- Recurring clinic hours with one-date exceptions. Existing clinics have every weekday enabled by default.
create table public.clinic_weekdays (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  weekdays int[] not null check (weekdays <@ array[0,1,2,3,4,5,6] and array_position(weekdays, null) is null)
);
alter table public.clinic_weekdays enable row level security;

alter table public.clinic_day_overrides
  drop constraint clinic_day_overrides_state_check,
  drop constraint clinic_day_overrides_check,
  add constraint clinic_day_overrides_state_check check (state in ('open','closed','postponed')),
  add constraint clinic_day_overrides_check check (
    (state = 'postponed' and moved_to is not null and moved_to > day) or
    (state in ('open','closed') and moved_to is null)
  );

create function public.clinic_working_days(p_slug text)
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(w.weekdays, array[0,1,2,3,4,5,6])
  from clinics c left join clinic_weekdays w on w.clinic_id = c.id
  where c.slug = p_slug and c.kind = 'clinic'
$$;

create function public.set_clinic_weekdays(p_clinic uuid, p_days int[])
returns int[] language plpgsql security definer set search_path = public as $$
declare normalized int[];
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if p_days is null or array_position(p_days, null) is not null or not p_days <@ array[0,1,2,3,4,5,6]
  then raise exception 'invalid_weekdays'; end if;
  perform 1 from clinics where id = p_clinic and kind = 'clinic' for update;
  if not found then raise exception 'clinic_not_found'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into normalized from unnest(p_days) as days(d);
  insert into clinic_weekdays (clinic_id, weekdays) values (p_clinic, normalized)
  on conflict (clinic_id) do update set weekdays = excluded.weekdays;
  return normalized;
end $$;

revoke all on function public.clinic_working_days(text), public.set_clinic_weekdays(uuid,int[]) from public, anon, authenticated;
grant execute on function public.clinic_working_days(text) to anon, authenticated;
grant execute on function public.set_clinic_weekdays(uuid,int[]) to authenticated;


create or replace function public.clinic_schedule(p_slug text)
returns table(day date, booked int, capacity int, state text, moved_to date)
language sql stable security definer set search_path = public as $$
  select today_iq() + g.n, coalesce(b.n, 0), c.daily_limit,
    case
      when o.state in ('closed', 'postponed') then o.state
      when o.state is distinct from 'open' and not extract(dow from today_iq() + g.n)::int =
        any(coalesce(w.weekdays, array[0,1,2,3,4,5,6])) then 'closed'
      when coalesce(b.n, 0) >= c.daily_limit then 'full'
      else 'open'
    end,
    o.moved_to
  from clinics c
  left join clinic_weekdays w on w.clinic_id = c.id
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

create or replace function public.set_clinic_day_open(p_clinic uuid, p_day date, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(p_clinic, array['secretary']) then raise exception 'forbidden'; end if;
  if p_day is null or p_open is null or p_day not between today_iq() and today_iq() + 30 then
    raise exception 'invalid_day';
  end if;
  perform 1 from clinics where id = p_clinic and kind = 'clinic' for update;
  if not found then raise exception 'clinic_not_found'; end if;
  if p_open then
    insert into clinic_day_overrides (clinic_id, day, state) values (p_clinic, p_day, 'open')
    on conflict (clinic_id, day) do update set state = 'open', moved_to = null;
  else
    if exists (select 1 from bookings where clinic_id = p_clinic and day = p_day and status in ('waiting', 'in'))
    then raise exception 'day_has_bookings'; end if;
    insert into clinic_day_overrides (clinic_id, day, state) values (p_clinic, p_day, 'closed')
    on conflict (clinic_id, day) do update set state = 'closed', moved_to = null
    where clinic_day_overrides.state = 'open';
  end if;
end $$;

create or replace function public.postpone_clinic_day(p_clinic uuid, p_from date, p_to date)
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
  if exists (select 1 from clinic_schedule(c.slug) s where s.day = p_to and s.state in ('closed', 'postponed'))
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
