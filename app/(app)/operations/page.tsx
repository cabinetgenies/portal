import { EmptyState } from "@/components/empty-state/empty-state";
import { OperationsIcon } from "@/components/icons";
import { ContextualHelp } from "@/components/knowledge/contextual-help";
import { PageHeader } from "@/components/page-header/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { contextualKnowledge } from "@/lib/knowledge/queries";

export const metadata = {
  title: "Operations",
};

const PLANNED_TOOLS: readonly [string, string][] = [
  ["Sales-to-delivery handoff", "The structured review of what was sold before work starts."],
  ["Escalations", "A blocked job, raised with the department that can unblock it."],
  ["Field support", "Questions and blockers raised from site."],
  ["Internal workflow tools", "Department-specific steps that no other system owns."],
  ["Department status", "Where each department's work stands today."],
  ["Operational knowledge", "The SOPs and playbooks the workflows point at."],
];

/**
 * Operations — the home for department operational support that does not belong in
 * Buildertrend.
 *
 * Handoffs, escalations and field support are real needs and none of them are built
 * yet. The module is registered so role experiences can point at it, and this page
 * is honest about the state rather than dressed up with placeholder workflows.
 */
export default async function OperationsPage() {
  await requireSession();

  const help = await contextualKnowledge({ contextKey: "project-handoff" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Operations"
        description="Department operational support that does not belong in Buildertrend: handoffs, escalations and field support."
      />

      <EmptyState
        icon={<OperationsIcon className="h-5 w-5" />}
        title="No operational tools are built yet"
        description="Project execution stays in Buildertrend, and the internal workflows that belong here — handoff review, escalations, field support — have not been built. Nothing is simulated in the meantime."
      />

      <Panel
        id="operations-planned"
        title="Planned operational tools"
        description="Recorded here so the module has a stated purpose rather than an empty promise."
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLANNED_TOOLS.map(([title, description]) => (
            <li
              key={title}
              className="space-y-1 rounded-lg border border-line bg-surface-muted p-4"
            >
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-sm leading-6 text-ink-muted">{description}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <ContextualHelp items={help} contextKey="project-handoff" />
    </div>
  );
}
