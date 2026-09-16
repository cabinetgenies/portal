# Performance & Leadership database tests

These SQL assertions are intended to run in an isolated Supabase/Postgres
database after applying the Phase 6 migrations and the Phase 6.1 hardening
migration. They are not part of `npm test`, which is limited to pure TypeScript
tests and cannot provide an authenticated Postgres session.

Run the file with `psql` variables for the four required test profiles:

```text
\set admin_id '...'
\set manager_id '...'
\set employee_id '...'
\set other_id '...'
```

`admin_id` is an active admin/CEO, `manager_id` is the employee's assigned
manager, `employee_id` is the review employee, and `other_id` is an unrelated
active employee.

