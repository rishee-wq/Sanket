-- Sanket accounts: profiles and emergency contacts.
-- Run once in the Supabase dashboard (SQL Editor) or with `supabase db push`.
-- Every table uses row-level security so a user can only ever see their own rows.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role text check (role in ('deaf', 'hard_of_hearing', 'hearing', 'interpreter', 'other')),
  preferred_language text not null default 'en-IN' check (char_length(preferred_language) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert/delete policies: rows are created by the trigger below and removed
-- by the cascade when the auth user is deleted.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case
      when requested_role in ('deaf', 'hard_of_hearing', 'hearing', 'interpreter', 'other') then requested_role
      else null
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Emergency contacts shown on the SOS screen.
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9 ()-]{6,20}$'),
  relation text check (char_length(relation) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists emergency_contacts_user_id_idx on public.emergency_contacts (user_id);

alter table public.emergency_contacts enable row level security;

create policy "Users can read their own contacts"
  on public.emergency_contacts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own contacts"
  on public.emergency_contacts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can edit their own contacts"
  on public.emergency_contacts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own contacts"
  on public.emergency_contacts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- At most 5 contacts per user.
create or replace function public.limit_emergency_contacts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.emergency_contacts where user_id = new.user_id) >= 5 then
    raise exception 'You can save up to 5 emergency contacts.';
  end if;
  return new;
end;
$$;

drop trigger if exists emergency_contacts_limit on public.emergency_contacts;
create trigger emergency_contacts_limit
  before insert on public.emergency_contacts
  for each row execute function public.limit_emergency_contacts();

-- ---------------------------------------------------------------------------
-- Self-service account deletion. Deleting the auth user cascades to every
-- table above.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
