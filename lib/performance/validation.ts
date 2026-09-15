import { z } from "zod";

/**
 * Shared validation for Performance & Leadership forms.
 *
 * The UI sends strings; these schemas normalize empty values to null, dates to
 * plain date strings and numbers from numeric text before a Server Action touches
 * the database. Row Level Security remains the second, non-optional check.
 */

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Choose a value from the list.",
  });

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value.length === 0) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  })
  .refine((value) => value === null || value >= 0, {
    message: "Use zero or a positive number.",
  });

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use a valid date.",
  });

const booleanFromForm = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return false;
  const normalized = String(value).toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1";
}, z.boolean());

export const measurableCreateSchema = z.object({
  name: z
    .string({ error: "A name is required." })
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name must be 120 characters or fewer."),
  scope: z.enum(["company", "department", "employee"]),
  ownerProfileId: optionalUuid,
  departmentId: optionalUuid,
  employeeId: optionalUuid,
  target: optionalNumber,
  unit: optionalText,
  frequency: z.enum(["weekly", "monthly"]).default("weekly"),
  status: z.enum(["on_track", "off_track", "no_data"]).default("no_data"),
  notes: optionalText,
  knowledgeItemId: optionalUuid,
  active: booleanFromForm,
});

export const scorecardEntrySchema = z.object({
  measurableId: z
    .string({ error: "A measurable is required." })
    .trim()
    .regex(UUID_PATTERN, "A measurable is required."),
  periodStart: z.string({ error: "A start date is required." }).trim(),
  periodEnd: z.string({ error: "An end date is required." }).trim(),
  targetSnapshot: optionalNumber,
  actualValue: optionalNumber,
  status: z.enum(["on_track", "off_track", "no_data"]).default("no_data"),
  notes: optionalText,
});

export const priorityCreateSchema = z.object({
  title: z
    .string({ error: "A title is required." })
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title must be 160 characters or fewer."),
  description: optionalText,
  ownerProfileId: optionalUuid,
  departmentId: optionalUuid,
  quarter: z.coerce.number().int().min(1).max(4),
  year: z.coerce.number().int().min(2000).max(2200),
  dueDate: optionalDate,
  status: z
    .enum(["not_started", "on_track", "at_risk", "off_track", "complete"])
    .default("not_started"),
  percentComplete: z.coerce.number().int().min(0).max(100).default(0),
  notes: optionalText,
  knowledgeItemId: optionalUuid,
});

export const meetingCreateSchema = z.object({
  meetingTemplateId: optionalUuid,
  meetingType: z.enum(["leadership", "department"]),
  teamDepartmentId: optionalUuid,
  meetingDate: z.string({ error: "A meeting date is required." }).trim(),
  notes: optionalText,
});

export const headlineCreateSchema = z.object({
  meetingId: optionalUuid,
  title: z
    .string({ error: "A headline is required." })
    .trim()
    .min(2, "Headline must be at least 2 characters.")
    .max(160, "Headline must be 160 characters or fewer."),
  note: optionalText,
  type: optionalText,
  departmentId: optionalUuid,
});

export const issueCreateSchema = z.object({
  title: z
    .string({ error: "A title is required." })
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title must be 160 characters or fewer."),
  description: optionalText,
  departmentId: optionalUuid,
  ownerProfileId: optionalUuid,
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  status: z.enum(["open", "discussing", "resolved", "closed"]).default("open"),
  source: z
    .enum(["manual", "meeting", "scorecard", "quarterly_priority", "review"])
    .default("manual"),
  sourceId: optionalText,
  meetingId: optionalUuid,
});

export const issueNoteCreateSchema = z.object({
  issueId: z
    .string({ error: "An issue is required." })
    .trim()
    .regex(UUID_PATTERN, "An issue is required."),
  body: z
    .string({ error: "A note is required." })
    .trim()
    .min(2, "Note must be at least 2 characters."),
});

export const issueResolveSchema = z.object({
  issueId: z
    .string({ error: "An issue is required." })
    .trim()
    .regex(UUID_PATTERN, "An issue is required."),
  decision: z
    .string({ error: "A decision is required." })
    .trim()
    .min(2, "Decision must be at least 2 characters."),
});

export const actionCreateSchema = z.object({
  title: z
    .string({ error: "A title is required." })
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title must be 160 characters or fewer."),
  description: optionalText,
  ownerProfileId: optionalUuid,
  departmentId: optionalUuid,
  source: z
    .enum(["manual", "meeting", "issue", "review", "quarterly_priority"])
    .default("manual"),
  sourceId: optionalText,
  meetingId: optionalUuid,
  dueDate: optionalDate,
});

export const decisionCreateSchema = z.object({
  title: z
    .string({ error: "A title is required." })
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title must be 160 characters or fewer."),
  decision: z
    .string({ error: "A decision is required." })
    .trim()
    .min(2, "Decision must be at least 2 characters."),
  issueId: optionalUuid,
  meetingId: optionalUuid,
  departmentId: optionalUuid,
});

export const reviewCreateSchema = z.object({
  employeeId: z
    .string({ error: "An employee is required." })
    .trim()
    .regex(UUID_PATTERN, "An employee is required."),
  managerId: optionalUuid,
  periodStart: optionalDate,
  periodEnd: optionalDate,
  status: z
    .enum(["not_started", "in_progress", "employee_input", "manager_review", "complete"])
    .default("not_started"),
  scheduledDate: optionalDate,
  managerNotes: optionalText,
});

export type MeasurableCreateInput = z.infer<typeof measurableCreateSchema>;
export type PriorityCreateInput = z.infer<typeof priorityCreateSchema>;
export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>;
export type IssueCreateInput = z.infer<typeof issueCreateSchema>;
export type ActionCreateInput = z.infer<typeof actionCreateSchema>;
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;
