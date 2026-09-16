# Phase 7A — Cabinet Genies AI orchestrator (first working release)

## 1. Architecture decision

All assistant requests enter one logical **Company Orchestrator**. It plans a
request, delegates only when a specialist adds real value, receives every
specialist result, requests another specialist when one returns a validated
dependency, and produces the final human-facing answer.

Ordinary deterministic UI actions (forms, calculations, approvals, PDF
rendering) stay normal application services and are never routed through a
model.

The runtime is TypeScript with the **Vercel AI SDK** as the model/tool adapter.
The single configured provider adapter is `@ai-sdk/openai`. There is no second
queue/workflow engine, no LangGraph/CrewAI runtime, no background durability
claim, and no silent provider fallback for company data.

### Exact dependencies

- `ai` `^7.0.102`
- `@ai-sdk/openai` `^4.0.67`

Both are pinned in `package.json` and the lockfile. Provider/model ids live in
server configuration only (`AI_MODEL`, `AI_API_KEY`, optional `AI_BASE_URL`).
The Codex desktop DeepSeek configuration is deliberately not copied into the
application.

The bounded controller lives in `lib/ai/orchestrator.ts`. The Vercel adapter is
in `lib/ai/model.ts`. The agent/skill/tool registry is in `lib/ai/registry.ts`.
Structured contracts live in `lib/ai/schema.ts`.

## 2. What is enabled, and what is missing

Enabled and implemented:

- Company Orchestrator (`orchestrator`)
- Company Guide (`company-guide`)
- Sales & Commission (`sales-commission`)
- Communications (`communications`)

Registered but disabled:

- Leadership (`leadership`) — Phase 6 exists in the codebase, but its tool
  authorization was not separately re-verified for this assistant. It remains
  off with a clear dependency until that verification is done.

The assistant is **off by default**. Enabling requires all of:

1. `AI_MODEL` and `AI_API_KEY` in server configuration.
2. An admin enables the agent under Admin → AI.
3. An admin maps the agent to a business role under Admin → AI (pilot access).

If any of those is missing, the UI shows a clear notice and never a fake answer.

## 3. Tool and data authorization matrix

Effective access is the intersection of the verified user session, resource
access (Row Level Security), the reviewed agent allowlist, the admin-narrowed
tool set, and action state. Delegation never escalates authority.

| Tool | Used by | Requires any capability | Data source | Business write? |
| --- | --- | --- | --- | --- |
| `searchApprovedKnowledge` | orchestrator, company-guide | none | published `knowledge_items` (RLS) | no |
| `readApprovedKnowledgeItem` | company-guide | none | published `knowledge_items` (RLS) | no |
| `getMyCommissionSummary` | sales-commission | `view:own-commission` | own commission view models | no |
| `getProjectCommissionContext` | sales-commission | `view:financials`, `view:own-commission`, `calculate:commission` | permitted project + commission view models | no |
| `previewCommissionScenario` | sales-commission | `view:financials`, `calculate:commission` | assigned plan + deterministic engine | no |
| `getLeadershipMeetingContext` | leadership (disabled) | performance capabilities | Phase 6 read layer (RLS) | no |

The runtime never exposes `execute_sql`, migrations, generic table writes, the
Supabase Management API, shell, filesystem access, browser automation, or
arbitrary HTTP. The developer Supabase MCP/PAT is for development only and is
never loaded into runtime prompts, tool arguments, client bundles, or memory.

## 4. Instructions, skills and provenance

- `ai/policies/SOUL.md` — shared behavioral guidance.
- `ai/policies/MEMORY_POLICY.md` — what may be retained.
- `ai/agents/*/AGENT.md` and `agent.json` — versioned agent instructions and
  manifests.
- `ai/skills/*/SKILL.md` — reviewed skills with Agent Skills frontmatter.

The runtime bundles the reviewed content in `lib/ai/instructions.ts` and the
registry in `lib/ai/registry.ts`. It does not read arbitrary filesystem paths,
install remote skills at runtime, or let an administrator introduce tools,
hosts, code paths or permissions that are not in the reviewed registry.

Cabinet Genies-specific procedures are written from approved sources only.
Generic public prompts are not company policy.

## 5. Schema, RLS and retention

Additive migration: `supabase/migrations/20260915270000_ai_orchestrator.sql`.

Tables:

- `ai_agent_configs` — feature controls, model alias, narrowed tools, kill
  switches.
- `ai_role_agents` — pilot access from a business role to an agent.
- `ai_conversations` — owner-only private conversation history.
- `ai_messages` — owner-only transcript content.
- `ai_runs` — operating metadata only (no transcript content).
- `ai_run_steps` — typed, sanitized tool/run-step detail.
- `ai_artifacts` — private draft artifacts.

RLS decisions:

- Users read only their own conversations, messages, runs, run steps and
  artifacts.
- Administrators read run metadata for usage/failures, but transcripts and
  draft content stay owner-only.
- Feature controls and pilot mappings are readable by portal users (names and
  status only) and writable only by administrators.

Retention: conversation deletion cascades to messages, runs, steps and artifacts.
Raw transcripts are not written into the immutable business `audit_events`
stream. A documented retention policy for deletion/expiry is left for the
deployment owner; this release implements owner deletion via RLS rather than
company-wide retention automation.

## 6. Preflight findings

### Knowledge confidentiality

`knowledge_items` RLS currently makes published items readable by every
authenticated portal user; draft and archived items are administrator-only.
Role/department tags are relevance filters, not confidentiality controls.

Accordingly, Phase 7A retrieval indexes **published items only** and treats
them as company-wide approved. It never indexes private HR, personnel reviews or
contracts. When no published content matches, the assistant returns that fact
rather than fabricating policy.

### Commission settlement recognition

The canonical engine now recognizes prior commission from `gross_commission`
(credited before draw/rollover offsets) rather than `net_payable`. The AI
assistant calls the same `getJobCommissionContext` / `listEmployeeCommissionSummaries`
functions and does not duplicate commission math. It does not recalculate or
alter stored events, balances, rates or history. Isolated what-if calculations
remain transient and never update the project.

## 7. Tests and evaluation

`npm test` runs the deterministic domain tests and passes, including:

- registry validation and source-id revalidation;
- canonical commission settlement recognition coverage;
- the 32-case evaluation catalog invariants.

The evaluation catalog is `ai/evals/cases.json` (32 labeled cases across
specialist selection, unauthorized access, prompt injection, commission math,
drafts, quotas, cancellation, memory isolation and more).

`npm run eval:ai` reports the live model evaluation as **skipped** when
`AI_API_KEY` and `AI_EVAL_LIMIT` are not set. It performs a capped structured
output provider smoke test when they are set. No model-quality claim is made
from mocked software tests alone, and no paid API evaluation was run in this
pass (no key was configured).

### Honest limitations

- Citation validation re-checks that source ids were issued by this run and
  rehydrates metadata from the registry; it does not yet fully verify semantic
  entailment of every sentence against the cited source.
- Run-step rows use the user-scoped client and owner-only RLS. True
  service-role/service-bound write separation for durable workers is a Phase 7B
  item; ordinary business writes remain protected by their existing policies.
- No live provider model was exercised in this environment, so the AI SDK adapter
  is covered by typecheck/build and a documented (skipped) smoke path, not by a
  live model run.

## 8. Required server environment-variable names

- `AI_MODEL`
- `AI_API_KEY`
- `AI_BASE_URL` (optional)
- `AI_DAILY_QUOTA` (optional)
- `AI_WALL_TIME_MS` (optional)
- `AI_MAX_SPECIALISTS` (optional)
- `AI_MAX_CONCURRENT_SPECIALISTS` (optional)
- `AI_MAX_MODEL_CALLS` (optional)
- `AI_MAX_TOOL_CALLS` (optional)
- `AI_INPUT_COST_PER_MTOK` (optional)
- `AI_OUTPUT_COST_PER_MTOK` (optional)

No service-role key is required by the assistant.

## 9. Pilot enable, disable and rollback

Enable:

1. Set `AI_MODEL` and `AI_API_KEY` in the server environment.
2. Apply `supabase/migrations/20260915270000_ai_orchestrator.sql`.
3. Open Admin → AI, enable the `orchestrator` agent.
4. Map `orchestrator` (and the specialists to pilot) to a business role.

Disable:

- Toggle a role-agent mapping off to remove pilot access for that role, or
- disable the agent under Admin → AI, or
- set its kill switch for an immediate global stop for that agent.

Rollback:

- Stop routing by disabling the orchestrator mapping/config. To remove the
  feature entirely, delete this branch's changes or revert the commit; the
  additive migration can be left in place harmlessly (it creates no business
  writes), or dropped from the target database before release if desired.

## 10. Proposed Phase 7B

1. Put the bounded controller behind a small execution interface and adopt
   Vercel Workflow SDK for durable, crash-resumable runs.
2. Add a server-bound delegated-execution design: narrow run/resource scope,
   current permission revalidation, no persisted user JWT/refresh token, and no
   unrestricted service-role business reads.
3. Add a formal action-approval/write gateway with version+payload-hash
   confirmation, unique execution keys and transactional receipts.
4. Wire scheduled agents and notifications through the workflow layer.
5. Re-verify and enable the Leadership specialist after Phase 6 authorization
   is proven.
6. Add permission-filtered Postgres/pgvector retrieval behind the existing
   retrieval interface.

