import assert from "node:assert/strict";
import test from "node:test";

import {
  groupKnowledgeItemsByType,
  isKnowledgeItemInScope,
  knowledgeForContext,
  knowledgeTypeLabel,
  scopeKnowledgeItems,
} from "@/lib/knowledge/model";
import type { KnowledgeItemRow } from "@/lib/supabase/database.types";

/**
 * Knowledge scoping.
 *
 * The model has to answer three questions before any content is migrated: is this
 * item for this role, is it for this department, and is it what this screen asked
 * for? All three are pure functions, so they are already tested.
 */

function item(overrides: Partial<KnowledgeItemRow> & { id: string }): KnowledgeItemRow {
  return {
    title: overrides.id,
    slug: overrides.id,
    type: "sop",
    status: "published",
    department_id: null,
    business_role_id: null,
    description: null,
    body: null,
    reference_url: null,
    tags: [],
    context_key: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const SALES_ROLE = "role-sales-designer";
const DESIGN_ROLE = "role-designer";
const SALES_DEPT = "dept-sales";
const DESIGN_DEPT = "dept-design";

test("knowledge items can be scoped to a role", () => {
  const items = [
    item({ id: "commission-explainer", business_role_id: SALES_ROLE }),
    item({ id: "design-sop", business_role_id: DESIGN_ROLE }),
    item({ id: "company-wide", business_role_id: null }),
  ];

  const forSalesDesigner = scopeKnowledgeItems(items, { roleIds: [SALES_ROLE] });

  assert.deepEqual(
    forSalesDesigner.map((row) => row.id),
    ["commission-explainer", "company-wide"],
    "an item with no role is company-wide and stays in scope",
  );
});

test("knowledge items can be scoped to a department", () => {
  const items = [
    item({ id: "receiving-sop", department_id: "dept-warehousing" }),
    item({ id: "sales-playbook", department_id: SALES_DEPT }),
    item({ id: "policy", department_id: null }),
  ];

  assert.deepEqual(
    scopeKnowledgeItems(items, { departmentIds: [SALES_DEPT] }).map((row) => row.id),
    ["sales-playbook", "policy"],
  );
});

test("an item can be scoped to several roles through the join table", () => {
  const shared = item({ id: "shared-sop", business_role_id: SALES_ROLE });
  const links = [{ knowledge_item_id: "shared-sop", business_role_id: DESIGN_ROLE }];

  assert.equal(
    isKnowledgeItemInScope(shared, { roleIds: [DESIGN_ROLE] }, links),
    true,
    "one SOP can serve several roles without being duplicated",
  );
  assert.equal(isKnowledgeItemInScope(shared, { roleIds: [DESIGN_ROLE] }), false);
});

test("scope filters combine: role, department, type and status", () => {
  const items = [
    item({
      id: "match",
      business_role_id: SALES_ROLE,
      department_id: SALES_DEPT,
      type: "training",
      status: "published",
    }),
    item({
      id: "draft",
      business_role_id: SALES_ROLE,
      department_id: SALES_DEPT,
      type: "training",
      status: "draft",
    }),
    item({
      id: "wrong-type",
      business_role_id: SALES_ROLE,
      department_id: SALES_DEPT,
      type: "policy",
    }),
  ];

  assert.deepEqual(
    scopeKnowledgeItems(items, {
      roleIds: [SALES_ROLE],
      departmentIds: [SALES_DEPT],
      types: ["training"],
      statuses: ["published"],
    }).map((row) => row.id),
    ["match"],
  );
});

test("an empty scope does not filter anything out", () => {
  const items = [
    item({ id: "a", business_role_id: SALES_ROLE, department_id: DESIGN_DEPT }),
    item({ id: "b" }),
  ];

  assert.equal(scopeKnowledgeItems(items, {}).length, 2);
});

test("tags are a second way to ask, and exact context keys sort first", () => {
  const items = [
    item({ id: "tagged", tags: ["commission-overview"] }),
    item({ id: "exact", context_key: "commission-overview" }),
    item({ id: "unrelated", tags: ["something-else"] }),
    item({ id: "draft-help", context_key: "commission-overview", status: "draft" }),
  ];

  const help = knowledgeForContext(items, { contextKey: "commission-overview" });

  assert.deepEqual(
    help.map((row) => row.id),
    ["exact", "tagged"],
    "drafts are never surfaced as contextual help",
  );
});

test("contextual help is ordered by content type after the exact match", () => {
  const items = [
    item({ id: "document", context_key: "handoff", type: "document" }),
    item({ id: "sop", context_key: "handoff", type: "sop" }),
    item({ id: "training", context_key: "handoff", type: "training" }),
  ];

  assert.deepEqual(
    knowledgeForContext(items, { contextKey: "handoff" }).map((row) => row.id),
    ["training", "sop", "document"],
  );
});

test("contextual help respects the caller's limit", () => {
  const items = Array.from({ length: 6 }, (_, index) =>
    item({ id: `item-${index}`, context_key: "handoff" }),
  );

  assert.equal(knowledgeForContext(items, { contextKey: "handoff", limit: 2 }).length, 2);
});

test("the index groups by type in reading order and keeps unknown types visible", () => {
  const items = [
    item({ id: "doc", type: "document" }),
    item({ id: "expectation", type: "role_expectation" }),
    item({ id: "mystery", type: "future_type" }),
  ];

  const groups = groupKnowledgeItemsByType(items);

  assert.deepEqual(
    groups.map((group) => group.type),
    ["role_expectation", "document", "document"],
  );
  assert.equal(groups[groups.length - 1].label, "Other");
  assert.equal(knowledgeTypeLabel("future_type"), "future type");
  assert.equal(knowledgeTypeLabel("sop"), "SOP");
});
