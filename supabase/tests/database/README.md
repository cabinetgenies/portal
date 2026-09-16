# Performance database authorization tests

This suite runs through `supabase test db` against an isolated local Supabase
database. It creates deterministic fixtures and runs assertions under the
`authenticated` role, not as a service-role or superuser connection.

The tests cover:

- private manager review notes are not exposed to employees, unrelated users, or
  the accounting-visible audit log
- assigned managers can read private notes and save/finalize reviews
- employees cannot edit manager fields or finalize
- finalization is atomic and leaves no partial state on failure
- completed reviews and their notes are immutable
- meeting participants can read their meetings while unrelated users cannot
- meeting organizers can add/remove participants
- department access requires an explicit `department_leaders` record
- inactive and anonymous users are denied

