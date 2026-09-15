import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { PriorityForm, PriorityStatusForm, type SelectOption } from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import {
  priorityStatusLabel,
  priorityStatusTone,
  quarterLabel,
} from "@/lib/performance/model";
import {
  listPriorities,
  listVisibleProfileOptions,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Quarterly Priorities",
};

function currentQuarter(date: Date = new Date()) {
  return Math.floor(date.getMonth() / 3) + 1;
}

export default async function PrioritiesPage() {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");
  const today = new Date();

  const [priorities, catalog, profiles] = await Promise.all([
    listPriorities(),
    loadExperienceCatalog(),
    canManage ? listVisibleProfileOptions() : Promise.resolve([]),
  ]);

  const departmentOptions: SelectOption[] = catalog.departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const profileOptions: SelectOption[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
  }));
  const names = await profileNamesFor(priorities.map((priority) => priority.owner_profile_id));

  const sorted = [...priorities].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.quarter !== b.quarter) return b.quarter - a.quarter;
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="space-y-6">
      {sorted.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No quarterly priorities yet"
          description="Company, department and individual priorities use plain language here. Nothing has been seeded or simulated."
        />
      ) : (
        <Panel
          id="priorities"
          title="Quarterly Priorities"
          description="One list for company, department and individual priorities. Owners, status and due dates are the first thing shown."
        >
          <TableWrap>
            <Table caption="Quarterly priorities">
              <thead>
                <tr>
                  <Th>Priority</Th>
                  <Th>Quarter</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th>Complete</Th>
                  <Th>Due</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((priority) => (
                  <tr key={priority.id}>
                    <Td>
                      <span className="font-medium text-ink">{priority.title}</span>
                      {priority.description ? (
                        <span className="block text-xs text-ink-subtle">
                          {formatText(priority.description)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{quarterLabel(priority.quarter, priority.year)}</Td>
                    <Td>
                      {priority.owner_profile_id
                        ? names.get(priority.owner_profile_id) ?? "Unassigned"
                        : priority.department_id
                          ? "Department"
                          : "Company"}
                    </Td>
                    <Td>
                      <StatusBadge
                        label={priorityStatusLabel(priority.status)}
                        tone={priorityStatusTone(priority.status)}
                      />
                    </Td>
                    <Td>{priority.percent_complete}%</Td>
                    <Td>{formatDate(priority.due_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
      )}

      {canManage ? (
        <Panel
          id="add-priority"
          title="Add a quarterly priority"
          description="Create a company, department or individual priority. Status flow is simple: Not Started → On Track → At Risk → Off Track → Complete."
        >
          <PriorityForm
            departments={departmentOptions}
            profiles={profileOptions}
            defaultYear={today.getFullYear()}
            defaultQuarter={currentQuarter(today)}
          />
        </Panel>
      ) : null}

      {sorted.length > 0 ? (
        <Panel
          id="update-priorities"
          title="Update status"
          description="Owners can update their own priorities. Administrators can update any priority."
        >
          <div className="space-y-4">
            {sorted.map((priority) => (
              <div key={priority.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <p className="mb-2 text-sm font-medium text-ink">{priority.title}</p>
                <PriorityStatusForm
                  priorityId={priority.id}
                  status={priority.status}
                  percentComplete={priority.percent_complete}
                />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

