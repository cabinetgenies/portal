import { ActionButtonForm } from "@/components/ui/action-button-form";
import { StatusBadge } from "@/components/ui/badge";
import {
  CompensationPlanEditForm,
  CompensationPlanVersionForm,
  CompensationPlanTierForm,
} from "@/components/compensation/plan-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon } from "@/components/icons";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import {
  setCompensationPlanActive,
  setCompensationPlanVersionActive,
} from "@/lib/compensation/actions";
import type { PlanWithVersions } from "@/lib/compensation/queries";
import {
  participantKindLabel,
  type ThresholdType,
} from "@/lib/compensation/types";
import { formatDate, formatPercent } from "@/lib/utils/format";

/**
 * Renders commission plans with their effective-dated versions and tiers.
 *
 * `canEdit` is presentation only: every mutating control posts to a Server Action
 * that re-checks capability, and RLS is the final authority.
 */
export function PlanList({
  plans,
  canEdit,
  today,
}: {
  plans: PlanWithVersions[];
  canEdit: boolean;
  today: string;
}) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={<CommissionsIcon className="h-5 w-5" />}
        title="No commission plans yet."
        description={
          canEdit
            ? "Add a plan, then give it an effective-dated version and its GP tiers. Jobs sold against a version keep that version forever."
            : "Commission plans are configured by an administrator."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {plans.map((plan) => {
        const openVersion = plan.versions.find(
          (version) =>
            version.active &&
            version.effective_from <= today &&
            (version.effective_to === null || version.effective_to >= today),
        );

        return (
          <section
            key={plan.id}
            aria-label={plan.name}
            className="space-y-4 rounded-xl border border-line bg-surface p-5"
          >
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">
                    {plan.name}
                  </h2>
                  <StatusBadge
                    label={plan.active ? "Active" : "Inactive"}
                    tone={plan.active ? "positive" : "neutral"}
                  />
                  <StatusBadge
                    label={plan.plan_type === "straight_gp" ? "Straight GP" : plan.plan_type}
                    tone="info"
                  />
                  <StatusBadge
                    label={participantKindLabel(plan.participant_kind)}
                    tone="neutral"
                  />
                  {openVersion ? (
                    <StatusBadge
                      label={`Current: ${openVersion.version_name}`}
                      tone="neutral"
                    />
                  ) : (
                    <StatusBadge label="No version in force today" tone="warning" />
                  )}
                </div>
                {plan.description ? (
                  <p className="max-w-3xl text-sm leading-6 text-ink-muted">
                    {plan.description}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <ActionButtonForm
                  action={setCompensationPlanActive}
                  fields={{ planId: plan.id, active: plan.active ? "false" : "true" }}
                  label={plan.active ? "Deactivate plan" : "Activate plan"}
                  pendingLabel="Working…"
                />
              ) : null}
            </header>

            {canEdit ? (
              <details className="rounded-lg border border-line bg-surface-muted p-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Edit plan details
                </summary>
                <div className="pt-3">
                  <CompensationPlanEditForm plan={plan} />
                </div>
              </details>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                Versions
              </h3>

              {plan.versions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
                  This plan has no versions yet, so it cannot govern a job.
                </p>
              ) : (
                plan.versions.map((version) => (
                  <article
                    key={version.id}
                    className="space-y-3 rounded-lg border border-line p-4"
                  >
                    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium text-ink">
                          {version.version_name}
                        </h4>
                        <StatusBadge
                          label={version.active ? "Active" : "Inactive"}
                          tone={version.active ? "positive" : "neutral"}
                        />
                        <span className="text-xs text-ink-muted">
                          {formatDate(version.effective_from)} →{" "}
                          {version.effective_to ? formatDate(version.effective_to) : "open"}
                        </span>
                      </div>
                      {canEdit ? (
                        <ActionButtonForm
                          action={setCompensationPlanVersionActive}
                          fields={{
                            versionId: version.id,
                            active: version.active ? "false" : "true",
                          }}
                          label={version.active ? "Deactivate version" : "Activate version"}
                          pendingLabel="Working…"
                        />
                      ) : null}
                    </header>

                    {version.notes ? (
                      <p className="text-xs leading-5 text-ink-muted">{version.notes}</p>
                    ) : null}

                    {version.tiers.length === 0 ? (
                      <p className="text-sm text-ink-muted">
                        No tiers defined for this version.
                      </p>
                    ) : (
                      <TableWrap>
                        <Table caption={`Tiers for ${plan.name} ${version.version_name}`}>
                          <thead>
                            <tr>
                              <Th className="w-16">Order</Th>
                              <Th>Lower bound</Th>
                              <Th>Upper bound</Th>
                              <Th className="text-right">Rate</Th>
                              <Th>Label</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {version.tiers.map((tier) => (
                              <tr key={tier.id}>
                                <Td>{tier.sort_order}</Td>
                                <Td>
                                  {boundLabel(
                                    tier.lower_threshold_type,
                                    tier.lower_gp_percent,
                                  )}
                                </Td>
                                <Td>
                                  {boundLabel(
                                    tier.upper_threshold_type,
                                    tier.upper_gp_percent,
                                  )}
                                </Td>
                                <TdNumeric>{formatPercent(tier.rate)}</TdNumeric>
                                <Td className="text-ink-muted">{tier.label ?? "—"}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableWrap>
                    )}

                    {canEdit ? (
                      <details className="rounded-lg border border-line bg-surface-muted p-3">
                        <summary className="cursor-pointer text-sm font-medium text-ink">
                          Add tier to {version.version_name}
                        </summary>
                        <div className="pt-3">
                          <CompensationPlanTierForm
                            versionId={version.id}
                            suggestedSortOrder={version.tiers.length + 1}
                          />
                        </div>
                      </details>
                    ) : null}
                  </article>
                ))
              )}

              {canEdit ? (
                <details className="rounded-lg border border-line bg-surface-muted p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    Add a new version
                  </summary>
                  <div className="pt-3">
                    <CompensationPlanVersionForm
                      planId={plan.id}
                      suggestedStart={today}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function boundLabel(thresholdType: string, value: number | null) {
  const isProjectMinimum = (thresholdType as ThresholdType) === "project_minimum";

  if (isProjectMinimum) {
    if (value === null || value === 0) {
      return "Project minimum GP standard";
    }

    const offset = value * 100;
    return `Project minimum ${offset > 0 ? "+" : "−"}${Math.abs(offset).toFixed(2)} pts`;
  }

  if (value === null) {
    return "Open";
  }

  return formatPercent(value);
}
