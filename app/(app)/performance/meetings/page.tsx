import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { MeetingForm, type SelectOption } from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import { listMeetingTemplates, listMeetings } from "@/lib/performance/queries";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Meetings",
};

export default async function MeetingsPage() {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");

  const [meetings, templates, catalog] = await Promise.all([
    listMeetings(),
    listMeetingTemplates(),
    loadExperienceCatalog(),
  ]);

  const departmentOptions: SelectOption[] = catalog.departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const templateOptions: SelectOption[] = templates.map((template) => ({
    value: template.id,
    label: template.name,
  }));

  return (
    <div className="space-y-6">
      {meetings.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No meetings yet"
          description="Schedule a Leadership or Department meeting. The default Leadership Weekly agenda is seeded, but no meeting instances are invented."
        />
      ) : (
        <Panel
          id="meetings"
          title="Meetings"
          description="Leadership and department meetings. Open a meeting to move through scorecard, priorities, headlines, actions, issues and decisions in order."
        >
          <TableWrap>
            <Table caption="Meetings">
              <thead>
                <tr>
                  <Th>Meeting</Th>
                  <Th>Type</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((meeting) => (
                  <tr key={meeting.id}>
                    <Td>
                      <Link
                        href={`/performance/meetings/${meeting.id}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {meeting.meeting_type === "leadership" ? "Leadership meeting" : "Department meeting"}
                      </Link>
                    </Td>
                    <Td>{meeting.meeting_type === "leadership" ? "Leadership" : "Department"}</Td>
                    <Td>{formatDate(meeting.meeting_date)}</Td>
                    <Td>
                      <StatusBadge
                        label={
                          meeting.status === "completed"
                            ? "Completed"
                            : meeting.status === "cancelled"
                              ? "Cancelled"
                              : "Scheduled"
                        }
                        tone={
                          meeting.status === "completed"
                            ? "positive"
                            : meeting.status === "cancelled"
                              ? "neutral"
                              : "info"
                        }
                      />
                    </Td>
                    <Td>{formatText(meeting.notes)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
      )}

      {canManage ? (
        <Panel
          id="schedule-meeting"
          title="Schedule a meeting"
          description="Use the seeded Leadership Weekly template, or schedule a department meeting."
        >
          <MeetingForm templates={templateOptions} departments={departmentOptions} />
        </Panel>
      ) : null}
    </div>
  );
}

