import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { listMeetingTemplates } from "@/lib/performance/queries";

export const metadata = {
  title: "Performance Admin",
};

export default async function AdminPerformancePage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const templates = await listMeetingTemplates();

  return (
    <div className="space-y-6">
      <Panel
        id="performance-admin"
        title="Performance & Leadership administration"
        description="This phase keeps administration deliberately small: module visibility is managed under Role experiences, and the meeting structure is seeded as configuration."
      >
        <p className="text-sm leading-6 text-ink-muted">
          The Performance & Leadership module is registered in the module registry. CEO and
          Admin see it by default, Sales Leader sees it, and Project Manager / Field Manager
          are recorded as hidden until department-leader visibility is modelled more
          precisely than a static role assignment can express.
        </p>
      </Panel>

      <Panel
        id="meeting-templates"
        title="Meeting templates"
        description="The default Leadership Weekly template is structural seed data, not an operational value."
      >
        {templates.length === 0 ? (
          <EmptyState
            icon={<PerformanceIcon className="h-5 w-5" />}
            title="No meeting templates loaded"
            description="Apply the Phase 6 migrations to see the seeded Leadership Weekly template."
          />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{template.name}</p>
                  <p className="text-ink-muted">
                    {template.meeting_type === "leadership" ? "Leadership" : "Department"} ·{" "}
                    {template.cadence}
                  </p>
                </div>
                <span>{template.active ? "Active" : "Inactive"}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-sm leading-6 text-ink-muted">
        Measurable definitions, review cadence defaults and additional module settings are
        intentionally deferred until the terminology and workflows are refined. No complex
        configuration studio is built here.
      </p>
    </div>
  );
}
