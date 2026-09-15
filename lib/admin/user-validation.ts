import { z } from "zod";

import { PROFILE_ROLES } from "@/lib/supabase/database.types";

/**
 * Validation for the user directory and for portal account provisioning.
 *
 * Two rules here are structural rather than cosmetic:
 *   * Email addresses are normalised (trim + lowercase). Supabase Auth treats
 *     them case-insensitively, so normalising keeps the directory from showing
 *     what looks like two accounts for one person.
 *   * Nobody can be their own manager. Postgres would accept it, but a
 *     self-referencing reporting line means nothing and would confuse the
 *     attribution helpers built on top of it.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** How a portal account is created when the service role key is configured. */
export const ACCOUNT_PROVISIONING_MODES = ["invite", "password"] as const;
export type AccountProvisioningMode = (typeof ACCOUNT_PROVISIONING_MODES)[number];

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const emailField = z
  .string({ error: "Email address is required." })
  .trim()
  .min(1, "Email address is required.")
  .max(254, "Email address must be 254 characters or fewer.")
  .regex(EMAIL_PATTERN, "Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const roleField = z.enum(PROFILE_ROLES, { error: "Choose a portal role." });

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

const managerField = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Choose a manager from the list.",
  });

/**
 * Department and business role assignment.
 *
 * Both are optional: assignment is rolled out, and a profile without a business
 * role still resolves a sensible experience from its security role. When one is
 * supplied it has to be a real row, which is what the UUID check enforces before
 * Postgres checks the foreign key again.
 */
const departmentField = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Choose a department from the list.",
  });

const businessRoleField = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Choose a business role from the list.",
  });

const booleanField = (label: string) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined || value === "") return false;
    const normalized = String(value).toLowerCase();
    return normalized === "on" || normalized === "true" || normalized === "1";
  }, z.boolean({ error: `${label} must be true or false.` }));

// ---------------------------------------------------------------------------
// Creating a portal account
// ---------------------------------------------------------------------------

export const portalUserInviteSchema = z
  .object({
    mode: z.enum(ACCOUNT_PROVISIONING_MODES, {
      error: "Choose how this account should be created.",
    }),
    email: emailField,
    password: z
      .string()
      .max(PASSWORD_MAX_LENGTH, `Passwords must be ${PASSWORD_MAX_LENGTH} characters or fewer.`)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    firstName: optionalText("First name", 80),
    lastName: optionalText("Last name", 80),
    displayName: optionalText("Display name", 120),
    role: roleField,
    department: optionalText("Department", 80),
    departmentId: departmentField,
    businessRoleId: businessRoleField,
    managerId: managerField,
  })
  .superRefine((value, ctx) => {
    if (value.mode !== "password") {
      return;
    }

    if (!value.password) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Enter a password for this account.",
      });
      return;
    }

    if (value.password.length < PASSWORD_MIN_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      });
    }
  });

export type PortalUserInviteInput = z.infer<typeof portalUserInviteSchema>;

// ---------------------------------------------------------------------------
// Linking a profile to an existing Supabase Auth user
// ---------------------------------------------------------------------------

export const portalUserLinkSchema = z.object({
  authUserId: z
    .string({ error: "Supabase Auth user id is required." })
    .trim()
    .regex(
      UUID_PATTERN,
      "Paste the user's id from Supabase Authentication → Users (UUID format).",
    ),
  email: emailField,
  firstName: optionalText("First name", 80),
  lastName: optionalText("Last name", 80),
  displayName: optionalText("Display name", 120),
  role: roleField,
  department: optionalText("Department", 80),
  departmentId: departmentField,
  businessRoleId: businessRoleField,
  managerId: managerField,
});

export type PortalUserLinkInput = z.infer<typeof portalUserLinkSchema>;

// ---------------------------------------------------------------------------
// Editing a portal user
// ---------------------------------------------------------------------------

export const portalUserUpdateSchema = z
  .object({
    profileId: z
      .string({ error: "A portal user is required." })
      .trim()
      .regex(UUID_PATTERN, "A portal user is required."),
    firstName: optionalText("First name", 80),
    lastName: optionalText("Last name", 80),
    displayName: optionalText("Display name", 120),
    role: roleField,
    department: optionalText("Department", 80),
    departmentId: departmentField,
    businessRoleId: businessRoleField,
    managerId: managerField,
    active: booleanField("Active"),
  })
  .superRefine((value, ctx) => {
    if (value.managerId !== null && value.managerId === value.profileId) {
      ctx.addIssue({
        code: "custom",
        path: ["managerId"],
        message: "A portal user cannot be their own manager.",
      });
    }
  });

export type PortalUserUpdateInput = z.infer<typeof portalUserUpdateSchema>;
