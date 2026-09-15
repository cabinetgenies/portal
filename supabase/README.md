# Supabase setup

Phase 1 needs one table (`public.profiles`), a set of Row Level Security
policies, and an `auth.users` trigger that gives every new auth user a profile
row.

## Apply the migration

The Supabase CLI is not linked in this repository yet, so pick one of these:

**Option A — Supabase dashboard (fastest)**

1. Open the project → **SQL Editor** → **New query**.
2. Paste the contents of
   [`migrations/20260915090000_create_profiles.sql`](migrations/20260915090000_create_profiles.sql).
3. Run it. The script is idempotent, so re-running is safe.

**Option B — Supabase CLI**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Create the first portal users

1. Dashboard → **Authentication** → **Users** → **Add user**.
2. Set the email and a password. Supabase hashes and stores the password; the
   portal never handles password material itself.
3. The `on_auth_user_created` trigger inserts the matching `profiles` row with
   the default role `employee`.
4. Promote the first administrator:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@cabinetgenies.com';
```

Run that `update` from the SQL editor (which uses the service role and bypasses
RLS). A signed-in non-admin cannot promote themselves — the
`profiles_protect_privileged_columns` trigger rejects the write.

Optional profile fields can also be supplied when creating a user, via user
metadata:

```json
{ "first_name": "Dana", "last_name": "Reed", "department": "Sales" }
```

## Verify

```sql
-- Every auth user should have exactly one profile row.
select u.id, u.email, p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;
```

## What RLS allows

| Role | Can read | Can update |
| --- | --- | --- |
| employee | own profile | own profile (non-privileged columns) |
| supervisor | own profile + direct reports | own profile (non-privileged columns) |
| accounting | own profile | own profile (non-privileged columns) |
| admin | all profiles | all profiles |
| ceo | all profiles | all profiles |

Anonymous (unauthenticated) requests can read nothing: the table privileges for
the `anon` role are revoked and no policy grants it access.
