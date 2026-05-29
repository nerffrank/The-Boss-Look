alter table public.appointments
add column if not exists status text not null default 'pending';

alter table public.appointments
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.appointments
drop constraint if exists appointments_unique_slot;

drop index if exists public.appointments_active_slot_unique;
create unique index appointments_active_slot_unique
on public.appointments (booking_date, booking_time)
where status <> 'cancelled';

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;

insert into public.admin_users (email)
values ('aidoofrank907@gmail.com')
on conflict (email) do nothing;

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
