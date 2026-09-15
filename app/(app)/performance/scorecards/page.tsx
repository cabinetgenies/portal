import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import {
  MeasurableForm,
  ScorecardEntryForm,
  type SelectOption,
} from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import { measurableScopeLabel, measurableStatusLabel, measurableStatusTone } from "@/lib/performance/model";
import {
  listMeasurables,
  listScorecardEntries,
  listVisibleProfileOptions,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Scorecards",
};

export default async function ScorecardsPage() {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");

  const [measurables, entries, catalog, profiles] = await Promise.all([
    listMeasurables(),
    listScorecardEntries(),
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
  const measurableOptions: SelectOption[] = measurables.map((measurable) => ({
    value: measurable.id,
    label: `${measurable.name} · ${measurableScopeLabel(measurable.scope)}`,
  }));

  const ownerIds = measurables.flatMap((measurable) => [
    measurable.owner_profile_id,
    measurable.employee_id,
  ]);
  const names = await profileNamesFor(ownerIds);

  const entriesByMeasurable = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByMeasurable.get(entry.measurable_id) ?? [];
    list.push(entry);
    entriesByMeasurable.set(entry.measurable_id, list);
  }

  return (
    <div className="space-y-6">
      {measurables.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No scorecard measurables yet"
          description="Add a company, department or employee measurable below. Weekly is the first supported frequency; the schema leaves room for monthly later."
        />
      ) : (
        <Panel
          id="measurables"
          title="Measurables"
          description="Company, department and employee scorecard lines. History is preserved as separate entries and is never overwritten."
        >
          <TableWrap>
            <Table caption="Scorecard measurables">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Scope</Th>
                  <Th>Owner</Th>
                  <Th>Target</Th>
                  <Th>Status</Th>
                  <Th>Active</Th>
                </tr>
              </thead>
              <tbody>
                {measurables.map((measurable) => (
                  <tr key={measurable.id}>
                    <Td>
                      <span className="font-medium text-ink">{measurable.name}</span>
                      {measurable.notes ? (
                        <span className="block text-xs text-ink-subtle">
                          {formatText(measurable.notes)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{measurableScopeLabel(measurable.scope)}</Td>
                    <Td>
                      {measurable.owner_profile_id
                        ? names.get(measurable.owner_profile_id) ??
                          (measurable.employee_id ? names.get(measurable.employee_id) : undefined) ??
                          "Unassigned"
                        : "Unassigned"}
                    </Td>
                    <Td className="font-mono text-[0.8125rem]">
                      {measurable.target === null || measurable.target === undefined
                        ? "—"
                        : `${measurable.target}${measurable.unit ? ` ${measurable.unit}` : ""}`}
                    </Td>
                    <Td>
                      <StatusBadge
                        label={measurableStatusLabel(measurable.status)}
                        tone={measurableStatusTone(measurable.status)}
                      />
                    </Td>
                    <Td>{measurable.active ? "Active" : "Inactive"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
      )}

      {canManage ? (
        <>
          <Panel
            id="add-measurable"
            title="Add a measurable"
            description="Create a new scorecard line. Entries are recorded separately after it exists."
          >
            <MeasurableForm departments={departmentOptions} profiles={profileOptions} />
          </Panel>

          {measurables.length > 0 ? (
            <Panel
              id="record-entry"
              title="Record a scorecard entry"
              description="Each entry is a new period. Recording a later period does not change an earlier one."
            >
              <ScorecardEntryForm measurables={measurableOptions} />
            </Panel>
          ) : null}
        </>
      ) : null}

      {entries.length > 0 ? (
        <Panel
          id="entry-history"
          title="Entry history"
          description="The most recent periods, oldest first within this page."
        >
          <TableWrap>
            <Table caption="Scorecard entry history">
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th>Target snapshot</Th>
                  <Th>Actual</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .slice()
                  .sort((a, b) => a.period_start.localeCompare(b.period_start))
                  .map((entry) => (
                    <tr key={entry.id}>
                      <Td>
                        {formatDate(entry.period_start)} – {formatDate(entry.period_end)}
                      </Td>
                      <Td>{entry.target_snapshot ?? "—"}</Td>
                      <Td>{entry.actual_value ?? "—"}</Td>
                      <Td>
                        <StatusBadge
                          label={measurableStatusLabel(entry.status)}
                          tone={measurableStatusTone(entry.status)}
                        />
                      </Td>
                      <Td>{formatText(entry.notes)}</Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
      ) : null}
    </div>
  );
}
