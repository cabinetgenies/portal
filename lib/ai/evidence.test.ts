import assert from "node:assert/strict";
import test from "node:test";

import { EvidenceRegistry } from "@/lib/ai/evidence";

test("only the server mints source ids and resolves them", () => {
  const registry = new EvidenceRegistry();
  const record = registry.register({
    recordType: "knowledge_item",
    recordId: "item-1",
    title: "Design handoff",
    version: "2026-09-15T00:00:00Z",
    sensitivity: "internal",
  });

  assert.match(record.id, /^src_knowledge_item_item-1_/);
  assert.equal(registry.resolve(record.id)?.title, "Design handoff");
  assert.equal(registry.resolve("src_invented"), null);
});

test("a source reference rehydrates only from the registry", () => {
  const registry = new EvidenceRegistry();
  const record = registry.register({
    recordType: "project",
    recordId: "project-1",
    title: "Kitchen remodel",
    sensitivity: "financial",
  });

  const reference = registry.toReference(record.id);
  assert.ok(reference);
  assert.equal(reference.recordId, "project-1");
  assert.equal(registry.toReference("src_invented"), null);
});

