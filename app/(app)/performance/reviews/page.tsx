import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { ReviewForm, ReviewStatusForm, type SelectOption } from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { reviewStatusLabel, reviewStatusTone } from "@/lib/performance/model";
import {
  listReviews,
  listVisibleProfileOptions,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Reviews",
};

export default async function ReviewsPage() {
  const session = await requireSession();
  const canCreateReview = session.capabilities.includes("view:performance-team");

  const [reviews, profiles] = await Promise.all([
    listReviews(),
    canCreateReview ? listVisibleProfileOptions() : Promise.resolve([]),
  ]);

  const employeeOptions: SelectOption[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
  }));
  const names = await profileNamesFor(
    reviews.flatMap((review) => [review.employee_id, review.manager_id]),
  );

  return (
    <div className="space-y-6">
      {reviews.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No performance reviews yet"
          description="Reviews reference the employee's business role, role expectations, measurables and priorities. No numeric scoring has been introduced, and no review data has been fabricated."
        />
      ) : (
        <Panel
          id="reviews"
          title="Performance reviews"
          description="Employee, manager, period, status and notes. The review references the person's role and performance data rather than duplicating it."
        >
          <TableWrap>
            <Table caption="Performance reviews">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Manager</Th>
                  <Th>Period</Th>
                  <Th>Status</Th>
                  <Th>Scheduled</Th>
                  <Th>Completed</Th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <Td>{names.get(review.employee_id) ?? "Employee"}</Td>
                    <Td>{review.manager_id ? names.get(review.manager_id) ?? "Manager" : "Manager"}</Td>
                    <Td>
                      {formatDate(review.period_start)} – {formatDate(review.period_end)}
                    </Td>
                    <Td>
                      <StatusBadge
                        label={reviewStatusLabel(review.status)}
                        tone={reviewStatusTone(review.status)}
                      />
                    </Td>
                    <Td>{formatDate(review.scheduled_date)}</Td>
                    <Td>{formatDate(review.completed_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
      )}

      {canCreateReview ? (
        <Panel
          id="create-review"
          title="Create a review"
          description="A manager creates the review and can return to it for employee input and manager review stages."
        >
          <ReviewForm employees={employeeOptions} managers={employeeOptions} />
        </Panel>
      ) : null}

      {reviews.length > 0 ? (
        <Panel
          id="review-notes"
          title="Review notes"
          description="The employee and manager can update status and their own notes."
        >
          <div className="space-y-4">
            {reviews.map((review) => {
              const isEmployee = review.employee_id === session.userId;
              const notesField = isEmployee ? "employee_notes" : "manager_notes";
              const notes = isEmployee ? review.employee_notes : review.manager_notes;

              return (
                <div key={review.id} className="rounded-xl border border-line bg-surface-muted p-4">
                  <p className="mb-2 text-sm font-medium text-ink">
                    {names.get(review.employee_id) ?? "Employee"} ·{" "}
                    {formatText(review.overall_summary, "No summary yet")}
                  </p>
                  <ReviewStatusForm
                    reviewId={review.id}
                    status={review.status}
                    notesField={notesField}
                    notes={notes ?? ""}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

