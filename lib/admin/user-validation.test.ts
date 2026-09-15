import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  portalUserInviteSchema,
  portalUserLinkSchema,
  portalUserUpdateSchema,
} from "@/lib/admin/user-validation";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const MANAGER_ID = "22222222-2222-4222-8222-222222222222";

test("an invite normalises the email and leaves blank names unset", () => {
  const parsed = portalUserInviteSchema.parse({
    mode: "invite",
    email: "  Designer@CabinetGenies.COM ",
    firstName: "  Dana  ",
    lastName: "",
    displayName: "   ",
    role: "employee",
    department: " Sales ",
    managerId: "",
  });

  assert.equal(parsed.email, "designer@cabinetgenies.com");
  assert.equal(parsed.firstName, "Dana");
  assert.equal(parsed.lastName, null);
  assert.equal(parsed.displayName, null);
  assert.equal(parsed.department, "Sales");
  assert.equal(parsed.managerId, null);
});

test("invites do not require a password but password accounts do", () => {
  const invite = portalUserInviteSchema.safeParse({
    mode: "invite",
    email: "designer@cabinetgenies.com",
    role: "employee",
  });

  assert.equal(invite.success, true);

  const missing = portalUserInviteSchema.safeParse({
    mode: "password",
    email: "designer@cabinetgenies.com",
    role: "employee",
  });

  assert.equal(missing.success, false);
  assert.deepEqual(
    missing.success ? [] : missing.error.issues.map((issue) => issue.path.join(".")),
    ["password"],
  );

  const short = portalUserInviteSchema.safeParse({
    mode: "password",
    email: "designer@cabinetgenies.com",
    role: "employee",
    password: "short",
  });

  assert.equal(short.success, false);

  const valid = portalUserInviteSchema.safeParse({
    mode: "password",
    email: "designer@cabinetgenies.com",
    role: "employee",
    password: "x".repeat(PASSWORD_MIN_LENGTH),
  });

  assert.equal(valid.success, true);
});

test("bad emails and unknown roles are rejected", () => {
  const badEmail = portalUserInviteSchema.safeParse({
    mode: "invite",
    email: "not-an-email",
    role: "employee",
  });

  assert.equal(badEmail.success, false);

  const badRole = portalUserInviteSchema.safeParse({
    mode: "invite",
    email: "designer@cabinetgenies.com",
    role: "sales_designer",
  });

  assert.equal(badRole.success, false);
});

test("an update refuses to make someone their own manager", () => {
  const result = portalUserUpdateSchema.safeParse({
    profileId: PROFILE_ID,
    role: "employee",
    active: "true",
    managerId: PROFILE_ID,
  });

  assert.equal(result.success, false);
  assert.deepEqual(
    result.success ? [] : result.error.issues.map((issue) => issue.path.join(".")),
    ["managerId"],
  );
});

test("an update reads the status select, including an absent checkbox", () => {
  const deactivated = portalUserUpdateSchema.parse({
    profileId: PROFILE_ID,
    role: "employee",
    active: "false",
    managerId: MANAGER_ID,
  });

  assert.equal(deactivated.active, false);
  assert.equal(deactivated.managerId, MANAGER_ID);

  const absent = portalUserUpdateSchema.parse({
    profileId: PROFILE_ID,
    role: "employee",
  });

  assert.equal(absent.active, false);
});

test("an update requires a real profile id", () => {
  const result = portalUserUpdateSchema.safeParse({
    profileId: "not-a-uuid",
    role: "employee",
    active: "true",
  });

  assert.equal(result.success, false);
});

test("linking requires the Supabase Auth user id to be a UUID", () => {
  const result = portalUserLinkSchema.safeParse({
    authUserId: "jordan@cabinetgenies.com",
    email: "jordan@cabinetgenies.com",
    role: "employee",
  });

  assert.equal(result.success, false);

  const valid = portalUserLinkSchema.parse({
    authUserId: PROFILE_ID,
    email: "jordan@cabinetgenies.com",
    role: "ceo",
  });

  assert.equal(valid.authUserId, PROFILE_ID);
  assert.equal(valid.role, "ceo");
  assert.equal(valid.managerId, null);
});
