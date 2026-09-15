import {
  KNOWLEDGE_ITEM_TYPES,
  type KnowledgeItemRow,
  type KnowledgeItemType,
} from "@/lib/supabase/database.types";

/**
 * Knowledge (BOS) is metadata first.
 *
 * This module is the scoping model: how a screen asks for the training, SOPs or
 * decision guides that belong to a department, a role, a type or a context key.
 * It is pure, so contextual help can be unit tested long before content is
 * migrated out of Notion.
 */

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeItemType, string> = {
  training: "Training",
  sop: "SOP",
  role_expectation: "Role expectation",
  playbook: "Playbook",
  form_reference: "Form",
  document: "Document",
  policy: "Policy",
  decision_guide: "Decision guide",
};

export const KNOWLEDGE_TYPE_HINTS: Record<KnowledgeItemType, string> = {
  training: "How to do the job, with a completion expectation.",
  sop: "The standard way a repeatable task is done.",
  role_expectation: "What this role is accountable for.",
  playbook: "A worked approach for a recurring situation.",
  form_reference: "A form or template used in the workflow.",
  document: "Reference material attached to a process.",
  policy: "A rule the company follows.",
  decision_guide: "How to choose when the situation is ambiguous.",
};

export const KNOWLEDGE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function isKnowledgeType(value: unknown): value is KnowledgeItemType {
  return typeof value === "string" && (KNOWLEDGE_ITEM_TYPES as readonly string[]).includes(value);
}

export function knowledgeTypeLabel(value: string) {
  return isKnowledgeType(value) ? KNOWLEDGE_TYPE_LABELS[value] : value.replaceAll("_", " ");
}

export function knowledgeStatusLabel(value: string) {
  return KNOWLEDGE_STATUS_LABELS[value] ?? value;
}

/** Type order for reading lists: expectations first, document libraries last. */
export const KNOWLEDGE_TYPE_ORDER: readonly KnowledgeItemType[] = [
  "role_expectation",
  "training",
  "sop",
  "playbook",
  "decision_guide",
  "policy",
  "form_reference",
  "document",
];

export type KnowledgeScope = {
  /** Business role ids the reader resolves to. An empty list means "any". */
  roleIds?: readonly string[];
  /** Department ids the reader belongs to. An empty list means "any". */
  departmentIds?: readonly string[];
  types?: readonly string[];
  tags?: readonly string[];
  contextKey?: string | null;
  statuses?: readonly string[];
};

export type KnowledgeItemRoleLink = {
  knowledge_item_id: string;
  business_role_id: string;
};

type ScopableItem = Pick<
  KnowledgeItemRow,
  "id" | "type" | "status" | "business_role_id" | "department_id" | "tags" | "context_key"
>;

/**
 * Whether an item is in scope for a reader.
 *
 * An item with no role and no department is company-wide and always in scope. An
 * item scoped to a role or department is in scope when the reader resolves to it,
 * including through the additional-role join table — which is what lets one SOP
 * serve three roles without being duplicated.
 */
export function isKnowledgeItemInScope(
  item: ScopableItem,
  scope: KnowledgeScope,
  links: readonly KnowledgeItemRoleLink[] = [],
) {
  const roleIds = scope.roleIds ?? [];
  const departmentIds = scope.departmentIds ?? [];

  if (item.business_role_id && roleIds.length > 0) {
    const linkedToRole =
      roleIds.includes(item.business_role_id) ||
      links.some(
        (link) =>
          link.knowledge_item_id === item.id && roleIds.includes(link.business_role_id),
      );

    if (!linkedToRole) return false;
  }

  if (item.department_id && departmentIds.length > 0) {
    if (!departmentIds.includes(item.department_id)) return false;
  }

  if (scope.types && scope.types.length > 0 && !scope.types.includes(item.type)) {
    return false;
  }

  if (scope.statuses && scope.statuses.length > 0 && !scope.statuses.includes(item.status)) {
    return false;
  }

  if (scope.contextKey && !matchesContext(item, scope.contextKey)) {
    return false;
  }

  if (scope.tags && scope.tags.length > 0) {
    const itemTags = item.tags ?? [];
    if (!scope.tags.some((tag) => itemTags.includes(tag))) return false;
  }

  return true;
}

/**
 * Contextual match.
 *
 * A screen asks by context key ("commission-overview", "inventory-receiving") and
 * gets the items tagged for it. Tags are the flexible half: an item can carry
 * several context keys without a schema change.
 */
export function matchesContext(
  item: Pick<KnowledgeItemRow, "context_key" | "tags">,
  contextKey: string,
) {
  if (item.context_key === contextKey) return true;
  return (item.tags ?? []).includes(contextKey);
}

export function scopeKnowledgeItems(
  items: readonly KnowledgeItemRow[],
  scope: KnowledgeScope,
  links: readonly KnowledgeItemRoleLink[] = [],
) {
  return items.filter((item) => isKnowledgeItemInScope(item, scope, links));
}

/**
 * The contextual help path: given a context key, return the items a screen should
 * surface, most specific first and then by reading order.
 */
export function knowledgeForContext(
  items: readonly KnowledgeItemRow[],
  {
    contextKey,
    roleIds = [],
    departmentIds = [],
    links = [],
    limit = 4,
  }: {
    contextKey: string;
    roleIds?: readonly string[];
    departmentIds?: readonly string[];
    links?: readonly KnowledgeItemRoleLink[];
    limit?: number;
  },
) {
  const scoped = scopeKnowledgeItems(
    items,
    { roleIds, departmentIds, contextKey, statuses: ["published"] },
    links,
  );

  return [...scoped]
    .sort((a, b) => {
      const exactA = a.context_key === contextKey ? 0 : 1;
      const exactB = b.context_key === contextKey ? 0 : 1;
      if (exactA !== exactB) return exactA - exactB;

      return (
        KNOWLEDGE_TYPE_ORDER.indexOf(a.type as KnowledgeItemType) -
        KNOWLEDGE_TYPE_ORDER.indexOf(b.type as KnowledgeItemType)
      );
    })
    .slice(0, limit);
}

/** Group a list by type in reading order, for the /knowledge index. */
export function groupKnowledgeItemsByType(items: readonly KnowledgeItemRow[]) {
  const groups = KNOWLEDGE_TYPE_ORDER.map((type) => ({
    type,
    label: KNOWLEDGE_TYPE_LABELS[type],
    items: items.filter((item) => item.type === type),
  })).filter((group) => group.items.length > 0);

  // Anything with a type the catalog does not know about still shows up rather
  // than disappearing silently.
  const known = new Set<string>(KNOWLEDGE_TYPE_ORDER);
  const ungrouped = items.filter((item) => !known.has(item.type));

  if (ungrouped.length > 0) {
    groups.push({ type: "document", label: "Other", items: ungrouped });
  }

  return groups;
}
