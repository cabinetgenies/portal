-- Cabinet Genies Portal — Phase 7A privilege hardening
--
-- After the AI orchestrator migration was applied, Supabase default privileges
-- left `authenticated` with broader table-level privileges on the seven new AI
-- tables than the RLS policies require (including TRUNCATE). TRUNCATE is not
-- row-level and is not constrained by RLS in the same way as row DML, so this
-- migration explicitly strips broad privileges and re-grants only the minimum
-- each table needs for its existing RLS policies and application behavior.
--
-- Scope is deliberately narrow:
--   * no application code changes
--   * no RLS policy changes
--   * no agent or role enablement
--   * no global/default privilege changes
--   * no `service_role` changes
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Agent feature controls
-- ---------------------------------------------------------------------------

revoke all on table public.ai_agent_configs from authenticated;
grant select, insert, update, delete on table public.ai_agent_configs to authenticated;
revoke all on table public.ai_agent_configs from anon;

-- ---------------------------------------------------------------------------
-- 2. Pilot access
-- ---------------------------------------------------------------------------

revoke all on table public.ai_role_agents from authenticated;
grant select, insert, update, delete on table public.ai_role_agents to authenticated;
revoke all on table public.ai_role_agents from anon;

-- ---------------------------------------------------------------------------
-- 3. Private conversations and messages
-- ---------------------------------------------------------------------------

revoke all on table public.ai_conversations from authenticated;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
revoke all on table public.ai_conversations from anon;

revoke all on table public.ai_messages from authenticated;
grant select, insert on table public.ai_messages to authenticated;
revoke all on table public.ai_messages from anon;

-- ---------------------------------------------------------------------------
-- 4. Runs and run steps
-- ---------------------------------------------------------------------------

revoke all on table public.ai_runs from authenticated;
grant select, insert, update on table public.ai_runs to authenticated;
revoke all on table public.ai_runs from anon;

revoke all on table public.ai_run_steps from authenticated;
grant select, insert on table public.ai_run_steps to authenticated;
revoke all on table public.ai_run_steps from anon;

-- ---------------------------------------------------------------------------
-- 5. Draft artifacts
-- ---------------------------------------------------------------------------

revoke all on table public.ai_artifacts from authenticated;
grant select, insert, update on table public.ai_artifacts to authenticated;
revoke all on table public.ai_artifacts from anon;
