-- Cabinet Genies Portal — Phase 4.1
-- Project categories leave the commission system.
--
-- Jobs no longer belong to a project category, and no commission logic reads one:
-- the rate comes from the plan version's fixed GP bands, and the final audit
-- snapshots job financials only.
--
-- What this migration does
--   1. Detaches every job from its category and drops the NOT NULL requirement, so a
--      commission job can be created and edited without a category at all.
--   2. Records the dormant pieces: `jobs.project_category_id` and the
--      `project_categories` table remain in the schema but nothing in the
--      application reads or writes them.
--
-- Why the column and table are retained rather than dropped
--   `jobs.project_category_id` is referenced by two existing trigger functions
--   (`jobs_enforce_update_permissions` and `log_job_audit_event`), so dropping the
--   column means rewriting both in the same migration — and a mistake there breaks
--   every job update rather than one screen. The table also holds the only record of
--   how the existing job was categorised. This phase explicitly allows keeping
--   schema when removal creates migration risk, so both stay in place, dormant and
--   detached from the application, and can be dropped in a follow-up once those
--   trigger bodies are rewritten.
--
-- Idempotent and safe to re-run.

alter table public.jobs
  alter column project_category_id drop not null;

update public.jobs
   set project_category_id = null
 where project_category_id is not null;

comment on column public.jobs.project_category_id is
  'DORMANT since Phase 4.1: project categories are no longer part of the commission system. Null for new jobs; not read or written by the application. Retained only because two trigger functions reference the column by name.';

comment on table public.project_categories is
  'DORMANT since Phase 4.1: project categories were removed from the commission system — no UI, no commission logic and no rate resolution depends on them. Retained for historical reference only.';

comment on column public.project_categories.minimum_gp_standard is
  'DORMANT since Phase 4.1: commission rates come from the plan version''s fixed GP bands. No active calculation uses a category minimum GP.';
