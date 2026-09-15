import type { StatusTone } from "@/lib/commission/types";

import {
  ACTION_SOURCES,
  ACTION_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_SOURCES,
  ISSUE_STATUSES,
  MEASURABLE_SCOPES,
  MEASURABLE_STATUSES,
  PRIORITY_STATUSES,
  REVIEW_STATUSES,
  type ActionSource,
  type ActionStatus,
  type IssuePriority,
  type IssueSource,
  type IssueStatus,
  type MeasurableScope,
  type MeasurableStatus,
  type PriorityStatus,
  type ReviewStatus,
} from "@/lib/supabase/database.types";

/**
 * Pure presentation and classification helpers for Performance & Leadership.
 *
 * No database, no React and no request context live here: the same helpers are
 * used by the pages and by the unit tests.
 */

export const MEASURABLE_SCOPE_LABELS: Record<MeasurableScope, string> = {
  company: "Company",
  department: "Department",
  employee: "Employee",
};

export function isMeasurableScope(value: unknown): value is MeasurableScope {
  return (
    typeof value === "string" &&
    (MEASURABLE_SCOPES as readonly string[]).includes(value)
  );
}

export function measurableScopeLabel(value: string | null | undefined) {
  return isMeasurableScope(value) ? MEASURABLE_SCOPE_LABELS[value] : "Unknown";
}

export const MEASURABLE_STATUS_LABELS: Record<MeasurableStatus, string> = {
  on_track: "On Track",
  off_track: "Off Track",
  no_data: "No Data",
};

export function measurableStatusLabel(value: string | null | undefined) {
  return (MEASURABLE_STATUSES as readonly string[]).includes(value ?? "")
    ? MEASURABLE_STATUS_LABELS[value as MeasurableStatus]
    : "Unknown";
}

export function measurableStatusTone(value: string | null | undefined): StatusTone {
  if (value === "on_track") return "positive";
  if (value === "off_track") return "critical";
  if (value === "no_data") return "neutral";
  return "neutral";
}

export const PRIORITY_STATUS_LABELS: Record<PriorityStatus, string> = {
  not_started: "Not Started",
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  complete: "Complete",
};

export function priorityStatusLabel(value: string | null | undefined) {
  return (PRIORITY_STATUSES as readonly string[]).includes(value ?? "")
    ? PRIORITY_STATUS_LABELS[value as PriorityStatus]
    : "Unknown";
}

export function priorityStatusTone(value: string | null | undefined): StatusTone {
  switch (value) {
    case "on_track":
      return "positive";
    case "complete":
      return "info";
    case "at_risk":
      return "warning";
    case "off_track":
      return "critical";
    default:
      return "neutral";
  }
}

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export function issuePriorityLabel(value: string | null | undefined) {
  return (ISSUE_PRIORITIES as readonly string[]).includes(value ?? "")
    ? ISSUE_PRIORITY_LABELS[value as IssuePriority]
    : "Normal";
}

export function issuePriorityTone(value: string | null | undefined): StatusTone {
  if (value === "critical") return "critical";
  if (value === "high") return "warning";
  return "neutral";
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  discussing: "Discussing",
  resolved: "Resolved",
  closed: "Closed",
};

export function issueStatusLabel(value: string | null | undefined) {
  return (ISSUE_STATUSES as readonly string[]).includes(value ?? "")
    ? ISSUE_STATUS_LABELS[value as IssueStatus]
    : "Unknown";
}

export function issueStatusTone(value: string | null | undefined): StatusTone {
  if (value === "resolved" || value === "closed") return "positive";
  if (value === "discussing") return "warning";
  return "neutral";
}

export const ISSUE_SOURCE_LABELS: Record<IssueSource, string> = {
  manual: "Manual",
  meeting: "Meeting",
  scorecard: "Scorecard",
  quarterly_priority: "Quarterly Priority",
  review: "Review",
};

export function issueSourceLabel(value: string | null | undefined) {
  return (ISSUE_SOURCES as readonly string[]).includes(value ?? "")
    ? ISSUE_SOURCE_LABELS[value as IssueSource]
    : "Manual";
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Open",
  complete: "Complete",
  cancelled: "Cancelled",
};

export function actionStatusLabel(value: string | null | undefined) {
  return (ACTION_STATUSES as readonly string[]).includes(value ?? "")
    ? ACTION_STATUS_LABELS[value as ActionStatus]
    : "Open";
}

export function actionStatusTone(value: string | null | undefined): StatusTone {
  if (value === "complete") return "positive";
  if (value === "cancelled") return "neutral";
  return "warning";
}

export const ACTION_SOURCE_LABELS: Record<ActionSource, string> = {
  manual: "Manual",
  meeting: "Meeting",
  issue: "Issue",
  review: "Review",
  quarterly_priority: "Quarterly Priority",
};

export function actionSourceLabel(value: string | null | undefined) {
  return (ACTION_SOURCES as readonly string[]).includes(value ?? "")
    ? ACTION_SOURCE_LABELS[value as ActionSource]
    : "Manual";
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  employee_input: "Employee Input",
  manager_review: "Manager Review",
  complete: "Complete",
};

export function reviewStatusLabel(value: string | null | undefined) {
  return (REVIEW_STATUSES as readonly string[]).includes(value ?? "")
    ? REVIEW_STATUS_LABELS[value as ReviewStatus]
    : "Unknown";
}

export function reviewStatusTone(value: string | null | undefined): StatusTone {
  if (value === "complete") return "positive";
  if (value === "employee_input" || value === "manager_review") return "warning";
  if (value === "in_progress") return "info";
  return "neutral";
}

export function quarterLabel(quarter: number | null | undefined, year: number | null | undefined) {
  if (!quarter || !year) return "Unknown";
  return `Q${quarter} ${year}`;
}

export function isOverdue({
  dueDate,
  completedAt,
  now = new Date(),
}: {
  dueDate: string | null | undefined;
  completedAt: string | null | undefined;
  now?: Date;
}) {
  if (!dueDate || completedAt) return false;

  const due = new Date(`${dueDate}T00:00:00Z`);
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );

  return due.getTime() < today.getTime();
}

export type PerformanceAccessLevel = "none" | "own" | "team" | "all";

export function performanceAccessLevel(
  capabilities: readonly string[],
): PerformanceAccessLevel {
  if (capabilities.includes("manage:performance") || capabilities.includes("view:performance-all")) {
    return "all";
  }
  if (capabilities.includes("view:performance-team")) {
    return "team";
  }
  if (capabilities.includes("view:performance-own")) {
    return "own";
  }
  return "none";
}

