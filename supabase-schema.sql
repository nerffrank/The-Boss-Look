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
  created_at timestamptz not null default timezone('utc', now()),
  constraint appointments_unique_slot unique (booking_date, booking_time)
);

alter table public.appointments enable row level security;

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
  order by appointments.booking_time asc;
$$;

grant execute on function public.booked_slots_for_date(date) to anon;
