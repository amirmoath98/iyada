-- عيادة: الجداول الأساسية
create extension if not exists pgcrypto;

-- ===== العيادات =====
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,40}$'),
  kind text not null default 'clinic' check (kind in ('clinic','radiology','lab','pharmacy')),
  name text not null,
  doctor_name text not null default '',
  specialty text not null default '',
  bio text not null default '',
  hours text not null default '',
  fee text not null default '',
  phone text not null default '',
  building text not null default '',
  floor text not null default '',
  room text not null default '',
  landmark text not null default '',
  area text not null default '',
  gov text not null default '',
  map_url text not null default '',
  logo_path text,
  open_time time not null default '16:00',
  daily_limit int not null default 30 check (daily_limit between 1 and 500),
  durations jsonb not null default '{"new":15,"follow":10,"surgery":20,"postop":10}',
  near_areas text[] not null default '{}',
  questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ===== الموظفين وصلاحياتهم =====
create table public.staff (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  role text not null check (role in ('doctor','secretary','partner')),
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

-- ===== المرضى (لكل عيادة؛ فرد العائلة = نفس الرقم واسم مختلف) =====
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  phone text not null check (phone ~ '^07[0-9]{9}$'),
  gov text not null default '',
  area text not null default '',
  created_at timestamptz not null default now(),
  unique (clinic_id, phone, name)
);

-- ===== الحجوزات: original_seq ثابت ما يتغير بعد الحجز =====
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  day date not null,
  original_seq int not null,
  type text not null check (type in ('new','follow','surgery','postop')),
  status text not null default 'waiting' check (status in ('waiting','in','done','cancelled','no_show')),
  near boolean not null default false,
  complaint text not null default '' check (length(complaint) <= 2000),
  answers jsonb not null default '{}',
  token text unique not null default encode(gen_random_bytes(16),'hex'),
  reminded boolean not null default false,
  confirmed boolean,
  created_at timestamptz not null default now(),
  unique (clinic_id, day, original_seq)
);
create index on public.bookings (clinic_id, day);
create index on public.bookings (patient_id);

-- ===== ترتيب شاشة المراجعين: منفصل عن التسلسل الأصلي =====
-- items: [{"id":"<uuid أو x-...>","booking_id":uuid|null,"name":"..."}]
create table public.display_queue (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  day date not null,
  items jsonb not null default '[]',
  cur int not null default -1,
  version int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, day)
);

-- ===== السجل الطبي (الطبيب بس) =====
create table public.medical_records (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  diagnosis text not null default '',
  prescription text not null default '',
  surgery jsonb,            -- {"name","date","hospital"}
  follow_up text not null default '',
  updated_at timestamptz not null default now()
);

-- ===== المرفقات: تنحفظ مثل ما وصلت =====
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  path text not null,
  source text not null default 'patient' check (source in ('patient','secretary','whatsapp','partner')),
  created_at timestamptz not null default now()
);

-- ===== الربط بين العيادات: طلب وموافقة =====
create table public.clinic_links (
  id uuid primary key default gen_random_uuid(),
  from_clinic uuid not null references public.clinics(id) on delete cascade,
  to_clinic uuid not null references public.clinics(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (from_clinic, to_clinic),
  check (from_clinic <> to_clinic)
);

-- ===== الإحالات =====
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  from_clinic uuid not null references public.clinics(id) on delete cascade,
  to_clinic uuid not null references public.clinics(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  patient_name text not null,
  what text not null check (length(what) between 2 and 500),
  result text,
  result_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===== صندوق رسائل الواتساب (يدزها whatsapp-send) =====
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  phone text not null,
  body text not null,
  direction text not null default 'out' check (direction in ('out','in')),
  status text not null default 'queued' check (status in ('queued','sent','failed','received')),
  send_after timestamptz not null default now(),
  error text,
  created_at timestamptz not null default now()
);
create index on public.messages (status, send_after);
