import assert from "node:assert/strict";
import test from "node:test";

import { registryExperienceConfiguration } from "@/lib/experience/config";
import { roleExperienceFor } from "@/lib/experience/resolve";
import { performanceAccessLevel } from "@/lib/performance/model";
import { capabilitiesFor } from "@/lib/permissions/roles";

test("employee performance access is own-only", () => {
  assert.equal(performanceAccessLevel(capabilitiesFor("employee")), "own");
  assert.equal(performanceAccessLevel(capabilitiesFor("accounting")), "own");
});

test("supervisors get team performance access, administrators get company access", () => {
  assert.equal(performanceAccessLevel(capabilitiesFor("supervisor")), "team");
  assert.equal(performanceAccessLevel(capabilitiesFor("admin")), "all");
  assert.equal(performanceAccessLevel(capabilitiesFor("ceo")), "all");
});

test("sales leader sees Performance, project manager is recorded hidden by default", () => {
  const configuration = registryExperienceConfiguration();

  const salesLeader = roleExperienceFor({
    roleKey: "sales_leader",
    resolutionSource: "assigned",
    capabilities: capabilitiesFor("supervisor"),
    configuration,
  });

  const projectManager = roleExperienceFor({
    roleKey: "project_manager",
    resolutionSource: "assigned",
    capabilities: capabilitiesFor("supervisor"),
    configuration,
  });

  assert.ok(salesLeader.modules.some((module) => module.key === "performance"));
  assert.equal(
    projectManager.modules.some((module) => module.key === "performance"),
    false,
    "a static role cannot yet model 'acting as department leader', so it stays hidden",
  );
});

test("an unassigned employee baseline does not expose the leadership module", () => {
  const experience = roleExperienceFor({
    roleKey: null,
    resolutionSource: "unassigned",
    capabilities: capabilitiesFor("employee"),
    configuration: registryExperienceConfiguration(),
  });

  assert.equal(
    experience.modules.some((module) => module.key === "performance"),
    false,
  );
});

