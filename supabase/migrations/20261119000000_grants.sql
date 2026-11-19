-- Table privileges for the accounts tables.
-- Newer Supabase projects no longer grant the API roles access to new tables
-- automatically. Row-level security (see the previous migration) still limits
-- every signed-in user to their own rows; these grants only open the door.

-- Visitors who are not signed in get nothing.
revoke all on public.profiles from anon;
revoke all on public.emergency_contacts from anon;

-- Signed-in users: read and edit their profile (rows are created by the sign-up trigger
-- and removed by the account-deletion cascade, so no insert or delete).
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- Signed-in users: manage their own emergency contacts.
revoke all on public.emergency_contacts from authenticated;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
