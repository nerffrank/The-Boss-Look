create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  booking_date date not null,
  booking_time time not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  notes text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop index if exists public.appointments_active_slot_unique;
create unique index appointments_active_slot_unique
on public.appointments (booking_date, booking_time)
where status <> 'cancelled';

alter table public.appointments enable row level security;

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;

drop policy if exists "Admin users can read own access record" on public.admin_users;
create policy "Admin users can read own access record"
on public.admin_users
for select
to authenticated
using (email = auth.email());

drop policy if exists "Public can create bookings" on public.appointments;
create policy "Public can create bookings"
on public.appointments
for insert
to anon
with check (true);

create or replace function public.booked_slots_for_date(requested_date date)
returns table (booking_time time)
language sql
security definer
set search_path = public
as $$
  select appointments.booking_time
  from public.appointments
  where appointments.booking_date = requested_date
    and appointments.status <> 'cancelled'
  order by appointments.booking_time asc;
$$;

grant execute on function public.booked_slots_for_date(date) to anon;

insert into public.admin_users (email)
values
  ('aidoofrank907@gmail.com'),
  ('thebosslookbarbers@gmail.com'),
  ('nkayappiah@icloud.com')
on conflict (email) do nothing;

drop policy if exists "Admin users can read appointments" on public.appointments;
create policy "Admin users can read appointments"
on public.appointments
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.email = auth.email()
  )
);

drop policy if exists "Admin users can update appointments" on public.appointments;
create policy "Admin users can update appointments"
on public.appointments
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.email = auth.email()
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.email = auth.email()
  )
);
