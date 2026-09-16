-- Cabinet Genies Portal — Phase 7A
-- AI Orchestrator persistence: feature controls, pilot access, private
-- conversation/run history and draft artifacts.
--
-- This is additive and safe to re-run. It deliberately does NOT put raw
-- transcripts into the immutable business audit stream. Conversations and
-- messages stay strictly owner-only; run rows keep only operating metadata so
-- administrators can see usage and failures without seeing transcripts.

-- ---------------------------------------------------------------------------
-- 1. Agent feature controls
-- ---------------------------------------------------------------------------

create table if not exists public.ai_agent_configs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null unique,
  enabled boolean not null default false,
  model_alias text not null default 'default',
  allowed_tools text[] not null default '{}',
  tool_limits jsonb not null default '{}'::jsonb,
  kill_switch boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_agent_configs is
  'Runtime feature controls for one reviewed agent manifest. The server enforces the manifest tool set; configuration can only disable or narrow it.';

alter table public.ai_agent_configs enable row level security;

revoke all on table public.ai_agent_configs from anon;
grant select, insert, update, delete on table public.ai_agent_configs to authenticated;

drop policy if exists "AI agent configs are readable by portal users" on public.ai_agent_configs;
create policy "AI agent configs are readable by portal users"
  on public.ai_agent_configs
  for select
  to authenticated
  using (true);

drop policy if exists "AI agent configs are managed by administrators" on public.ai_agent_configs;
create policy "AI agent configs are managed by administrators"
  on public.ai_agent_configs
  for all
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

drop trigger if exists ai_agent_configs_set_updated_at on public.ai_agent_configs;
create trigger ai_agent_configs_set_updated_at
  before update on public.ai_agent_configs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Pilot access: which business roles may use which agents
-- ---------------------------------------------------------------------------

create table if not exists public.ai_role_agents (
  id uuid primary key default gen_random_uuid(),
  business_role_id uuid not null references public.business_roles (id) on delete cascade,
  agent_id text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_role_id, agent_id)
);

comment on table public.ai_role_agents is
  'Pilot access mapping from a business role to an assistant agent. Business roles configure experience, never authorization.';

alter table public.ai_role_agents enable row level security;

revoke all on table public.ai_role_agents from anon;
grant select, insert, update, delete on table public.ai_role_agents to authenticated;

drop policy if exists "AI role agent assignments are readable by portal users" on public.ai_role_agents;
create policy "AI role agent assignments are readable by portal users"
  on public.ai_role_agents
  for select
  to authenticated
  using (true);

drop policy if exists "AI role agent assignments are managed by administrators" on public.ai_role_agents;
create policy "AI role agent assignments are managed by administrators"
  on public.ai_role_agents
  for all
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

drop trigger if exists ai_role_agents_set_updated_at on public.ai_role_agents;
create trigger ai_role_agents_set_updated_at
  before update on public.ai_role_agents
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Private conversations and messages
-- ---------------------------------------------------------------------------

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;

revoke all on table public.ai_conversations from anon;
grant select, insert, update, delete on table public.ai_conversations to authenticated;

drop policy if exists "AI conversations are visible to their owner" on public.ai_conversations;
create policy "AI conversations are visible to their owner"
  on public.ai_conversations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "AI conversations are created by their owner" on public.ai_conversations;
create policy "AI conversations are created by their owner"
  on public.ai_conversations
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "AI conversations are updated by their owner" on public.ai_conversations;
create policy "AI conversations are updated by their owner"
  on public.ai_conversations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "AI conversations are deleted by their owner" on public.ai_conversations;
create policy "AI conversations are deleted by their owner"
  on public.ai_conversations
  for delete
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row
  execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ai_messages is
  'Private conversation messages. Transcript content stays owner-only; it is never exposed as admin operating metadata.';

alter table public.ai_messages enable row level security;

revoke all on table public.ai_messages from anon;
grant select, insert on table public.ai_messages to authenticated;

drop policy if exists "AI messages are visible to their conversation owner" on public.ai_messages;
create policy "AI messages are visible to their conversation owner"
  on public.ai_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "AI messages are created by their conversation owner" on public.ai_messages;
create policy "AI messages are created by their conversation owner"
  on public.ai_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create index if not exists ai_messages_conversation_id_idx
  on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Runs (operating metadata only) and run steps
-- ---------------------------------------------------------------------------

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled', 'quota_exceeded')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  model_calls integer not null default 0,
  tool_calls integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.ai_runs is
  'Assistant run metadata. Administrators read this for usage and failures, but it contains no transcript content.';

alter table public.ai_runs enable row level security;

revoke all on table public.ai_runs from anon;
grant select, insert, update on table public.ai_runs to authenticated;

drop policy if exists "AI runs are visible to their owner" on public.ai_runs;
create policy "AI runs are visible to their owner"
  on public.ai_runs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "AI runs are visible to administrators" on public.ai_runs;
create policy "AI runs are visible to administrators"
  on public.ai_runs
  for select
  to authenticated
  using (public.current_profile_is_admin());

drop policy if exists "AI runs are created by their owner" on public.ai_runs;
create policy "AI runs are created by their owner"
  on public.ai_runs
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "AI runs are updated by their owner" on public.ai_runs;
create policy "AI runs are updated by their owner"
  on public.ai_runs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ai_runs_user_id_idx on public.ai_runs (user_id, created_at);

create table if not exists public.ai_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sequence integer not null,
  agent_id text,
  kind text not null check (kind in ('plan', 'specialist', 'tool', 'synthesis')),
  input jsonb,
  output jsonb,
  status text not null default 'completed',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.ai_run_steps is
  'Typed run-step rows for the assistant. Sanitized, secret-free operational detail for the owner.';

alter table public.ai_run_steps enable row level security;

revoke all on table public.ai_run_steps from anon;
grant select, insert on table public.ai_run_steps to authenticated;

drop policy if exists "AI run steps are visible to their owner" on public.ai_run_steps;
create policy "AI run steps are visible to their owner"
  on public.ai_run_steps
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "AI run steps are created by their owner" on public.ai_run_steps;
create policy "AI run steps are created by their owner"
  on public.ai_run_steps
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.ai_runs r
      where r.id = ai_run_steps.run_id
        and r.user_id = auth.uid()
    )
  );

create index if not exists ai_run_steps_run_id_idx on public.ai_run_steps (run_id, sequence);

-- ---------------------------------------------------------------------------
-- 5. Draft artifacts
-- ---------------------------------------------------------------------------

create table if not exists public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  run_id uuid references public.ai_runs (id) on delete set null,
  kind text not null,
  title text not null,
  content jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'rejected', 'expired')),
  version integer not null default 1,
  payload_hash text not null,
  unique_execution_key text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_artifacts is
  'Private draft artifacts. Saving a draft is not sending it; review/edit/confirm is a separate application action.';

alter table public.ai_artifacts enable row level security;

revoke all on table public.ai_artifacts from anon;
grant select, insert, update on table public.ai_artifacts to authenticated;

drop policy if exists "AI artifacts are visible to their owner" on public.ai_artifacts;
create policy "AI artifacts are visible to their owner"
  on public.ai_artifacts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "AI artifacts are created by their owner" on public.ai_artifacts;
create policy "AI artifacts are created by their owner"
  on public.ai_artifacts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "AI artifacts are updated by their owner" on public.ai_artifacts;
create policy "AI artifacts are updated by their owner"
  on public.ai_artifacts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists ai_artifacts_set_updated_at on public.ai_artifacts;
create trigger ai_artifacts_set_updated_at
  before update on public.ai_artifacts
  for each row
  execute function public.set_updated_at();

