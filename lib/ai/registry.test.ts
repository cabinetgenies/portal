import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_MANIFESTS,
  agentById,
  ORCHESTRATOR_AGENT_ID,
  skillById,
  toolById,
  validateRegistry,
} from "@/lib/ai/registry";

test("the reviewed registry validates at startup", () => {
  const summary = validateRegistry();
  assert.ok(summary.agents >= 5);
  assert.ok(summary.skills >= 3);
  assert.ok(summary.tools >= 5);
});

test("every agent references only reviewed skills and tools", () => {
  for (const agent of AGENT_MANIFESTS) {
    for (const skillId of agent.skillIds) {
      assert.ok(skillById(skillId), `${agent.id} references unknown skill ${skillId}`);
    }
    for (const toolId of agent.allowedToolIds) {
      assert.ok(toolById(toolId), `${agent.id} references unknown tool ${toolId}`);
    }
  }
});

test("the orchestrator is present and never delegates recursively", () => {
  const orchestrator = agentById(ORCHESTRATOR_AGENT_ID);
  assert.ok(orchestrator);
  assert.ok(!orchestrator.skillIds.includes("leadership"));
});

test("leadership is registered but disabled until its dependency is verified", () => {
  const leadership = agentById("leadership");
  assert.ok(leadership);
  assert.ok(leadership.disabledReason);
});

