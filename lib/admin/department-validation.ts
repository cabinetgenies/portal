import { z } from "zod";

/**
 * Validation for editing a department.
 *
 * Deliberately narrow: name, description, owner and active status. The slug is the
 * stable key the code and the knowledge scope refer to, so it is not editable from
 * the UI — renaming a department changes the label, never the identity.
 */

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const departmentUpdateSchema = z.object({
  departmentId: z
    .string({ error: "A department is required." })
    .trim()
    .regex(UUID_PATTERN, "A department is required."),
  name: z
    .string({ error: "Department name is required." })
    .trim()
    .min(2, "Department name must be at least 2 characters.")
    .max(80, "Department name must be 80 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(280, "Description must be 280 characters or fewer.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  ownerProfileId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || UUID_PATTERN.test(value), {
      message: "Choose a department owner from the list.",
    }),
  active: z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined || value === "") return false;
    const normalized = String(value).toLowerCase();
    return normalized === "on" || normalized === "true" || normalized === "1";
  }, z.boolean()),
});

export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
