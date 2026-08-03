create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique not null,
  name text not null,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  active boolean not null default true,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time not null,
  family_person_name text not null,
  event_type text not null,
  day text,
  venue_location text,
  city text,
  google_maps_link text,
  details text,
  status text not null default 'Pending' check (status in ('Pending','Confirmed','Tentative','Regretted')),
  revision integer not null default 1,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists events_date_time_idx on public.events(event_date,event_time);
create index if not exists events_status_idx on public.events(status);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.activity_logs enable row level security;

-- The web application accesses these tables only through the Vercel API using
-- SUPABASE_SERVICE_ROLE_KEY. No public/anon table policies are intentionally added.
