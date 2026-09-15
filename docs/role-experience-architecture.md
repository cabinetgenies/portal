# Role experience architecture (Phase 5)

The portal is role-aware. What that means in this codebase is specific, and the
three concepts below are kept apart everywhere:

| Concept | Question it answers | Where it lives | Enforced by |
| --- | --- | --- | --- |
| **Security role** | What is this person allowed to access or do? | `profiles.role` | Capabilities in code + Row Level Security |
| **Department** | Where does this person belong? | `departments` + `profiles.department_id` | Reference data; ownership grants nothing |
| **Business role** | What does this person's app look like? | `business_roles` + `profiles.business_role_id` | Configuration only — never authorization |

A business role is the *experience*: which modules appear, which dashboard widgets
render, which quick actions are offered and which knowledge is in scope. It is not
a permission, and it cannot become one: capability requirements for modules and
quick actions live in code (`lib/permissions/module-capabilities.ts`), so editing
an experience can never widen what somebody is allowed to do. Hiding a module in
configuration does not remove access, and showing one does not grant it — the
route still re-checks the capability and Postgres still enforces RLS.

## The pieces

| Registry | Table | Code mirror | Notes |
| --- | --- | --- | --- |
| Modules | `app_modules` | `lib/experience/catalog.ts` | Home, Sales, Projects, Commissions, Requests, People, Inventory, Operations, Knowledge, Admin |
| Widgets | `dashboard_widgets` | `lib/experience/catalog.ts` | 13 widgets over 5 renderers |
| Quick actions | `quick_actions` | `lib/experience/catalog.ts` | Active ones reach a real screen; planned ones are catalogued inactive |
| Departments | `departments` | `lib/business/catalog.ts` | The ten official departments |
| Business roles | `business_roles` | `lib/business/catalog.ts` | Twelve roles, each with a default experience |

Role assignment tables (`role_modules`, `role_dashboard_widgets`,
`role_quick_actions`) store the decisions: visibility, emphasis, order and span.
They are edited under **Admin → Roles** and read by the resolver.

## How a screen is assembled

```
current user
  → profile.business_role_id            (or a fallback, see below)
  → role_modules / role_dashboard_widgets / role_quick_actions
  → capability filter                   (lib/permissions/module-capabilities.ts)
  → RoleExperience                      (lib/experience/resolve.ts)
  → sidebar navigation, /home dashboard, quick actions
```

`lib/experience/resolve.ts` is pure: configuration in, experience out. That is why
the shell, the role detail page and the read-only preview cannot disagree — they
call the same function — and why the resolver is unit tested without a database.

### When no business role is assigned

Business-role assignment is new, so every existing profile predates it. Rather
than rendering an empty app, the resolver reports which case applied:

* `assigned` — the profile has a business role; the intended path.
* `auth_role_fallback` — no business role yet, so the security role stands in
  (CEO → CEO experience, accounting → Bookkeeping, supervisor → Project Manager).
* `unassigned` — no business role and no useful security role: the baseline
  experience (Home, Requests, People, Knowledge) and the shell says so.

The fallback changes what is *shown*. It never changes what is *allowed*.

### When the configuration tables cannot be read

`loadExperienceCatalog()` falls back to the code registry and records why. The
shell, the role list and the preview keep working; the admin editors go read-only,
because there is nothing to write to. A misconfigured or unmigrated deployment is
degraded and explicit, never silently empty.

## Admin surfaces

| Route | What it does |
| --- | --- |
| `/admin/departments` | The ten departments: name, description, owner, active status, associated roles, plus basic editing |
| `/admin/roles` | The role catalog with people, module, widget and action counts |
| `/admin/roles/[id]` | One role in full: overview, module experience, dashboard widgets, quick actions, knowledge scope, assigned people, with show/hide and reorder |
| `/admin/role-experiences` | Read-only preview of any role: modules, dashboard, quick actions, knowledge scope and permission summary |
| `/admin/users` | Assigns each person a security role, a primary department and a business role |

The preview is **not** impersonation. It does not switch sessions, does not touch
the auth client, and does not bypass a policy; it renders configuration through the
same resolver the shell uses. A business role does not imply a security role, so
the preview's permission summary lists the capabilities each gated item needs and
which security roles hold them, instead of pretending the role has permissions.

## Knowledge (BOS) scoping

`knowledge_items` carries the metadata: title, slug, type (training, SOP, role
expectation, playbook, form reference, document, policy, decision guide), status,
an optional department and an optional primary business role, tags, and a
`context_key`. `knowledge_item_roles` adds further roles to one item, so a single
SOP can serve three roles without being duplicated.

`lib/knowledge/model.ts` is the pure scoping model: by role, department, type,
tag or context key. `lib/knowledge/queries.ts` is the read path, and
`contextualKnowledge({ contextKey })` is what a screen calls to surface its own
help. If nothing is published for that context key, the component renders nothing
rather than inventing content.

## Deliberately not built in this phase

* One dashboard component per role. The widget registry and shared renderers exist
  precisely to avoid that.
* A drag-and-drop dashboard builder or a no-code page builder. Reordering is one
  place up or down, and the role is the unit of configuration.
* Multi-role assignment. One primary department and one primary business role per
  profile; the columns are nullable so secondary assignments can be added later.
* Inventory, Operations workflows, requests and approvals. Those modules are
  registered and routed with honest shells — no invented data.
* Notion content migration. The metadata foundation is ready; no content was
  fabricated to fill it.
* Visual polish. Timeline, palette and typography wait for the UI phase.

## Verifying the configuration

```sql
-- Modules, roles and the parts of the experience that are configured.
select key, name, nav_section, display_order from public.app_modules order by display_order;
select key, name from public.business_roles order by display_order;

-- What the Sales Designer experience shows.
select m.key, rm.is_visible, rm.is_emphasized, rm.display_order
from public.role_modules rm
join public.business_roles r on r.id = rm.business_role_id
join public.app_modules m on m.id = rm.module_id
where r.key = 'sales_designer'
order by rm.display_order;

-- Who has which experience, and who still needs an assignment.
select p.email, sr.key as business_role, d.name as department
from public.profiles p
left join public.business_roles sr on sr.id = p.business_role_id
left join public.departments d on d.id = p.department_id
order by p.email;
```

Every configuration change is written to `public.audit_events` by the same
append-only triggers the rest of the portal uses, including
`department_assignment_changed` and `business_role_changed` on a profile.
