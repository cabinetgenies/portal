import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import {
  knowledgeForContext,
  scopeKnowledgeItems,
  type KnowledgeItemRoleLink,
  type KnowledgeScope,
} from "@/lib/knowledge/model";
import type { KnowledgeItemRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Knowledge read layer.
 *
 * Reads never throw for a reader who cannot see anything: an unapplied migration,
 * an empty library or a denied row all mean "no knowledge items here", which is
 * exactly what the module should say. Contextual help must never be able to take
 * a page down, so every failure here degrades to an empty list.
 */

export type KnowledgeQuery = KnowledgeScope & {
  /** Department slugs are resolved to ids before filtering. */
  departmentSlugs?: readonly string[];
};

async function loadKnowledgeRows(): Promise<{
  items: KnowledgeItemRow[];
  links: KnowledgeItemRoleLink[];
}> {
  if (!isSupabaseConfigured) {
    return { items: [], links: [] };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [items, links] = await Promise.all([
      supabase.from("knowledge_items").select("*").order("updated_at", { ascending: false }),
      supabase.from("knowledge_item_roles").select("knowledge_item_id, business_role_id"),
    ]);

    if (items.error) {
      console.error("Could not read knowledge items:", items.error.message);
      return { items: [], links: [] };
    }

    // A missing join table (or a denied read) only costs the additional-role
    // scoping, not the list itself.
    if (links.error) {
      console.error("Could not read knowledge role scope:", links.error.message);
    }

    return {
      items: (items.data ?? []) as KnowledgeItemRow[],
      links: (links.data ?? []) as KnowledgeItemRoleLink[],
    };
  } catch (error) {
    console.error("Could not read knowledge items:", error);
    return { items: [], links: [] };
  }
}

export const listKnowledgeItems = cache(async function listKnowledgeItems(
  query: KnowledgeQuery = {},
): Promise<KnowledgeItemRow[]> {
  const { items, links } = await loadKnowledgeRows();

  const departmentIds =
    query.departmentSlugs && query.departmentSlugs.length > 0
      ? await departmentIdsForSlugs(query.departmentSlugs)
      : (query.departmentIds ?? []);

  return scopeKnowledgeItems(
    items,
    {
      roleIds: query.roleIds,
      departmentIds,
      types: query.types,
      tags: query.tags,
      contextKey: query.contextKey ?? null,
      statuses: query.statuses,
    },
    links,
  );
});

/**
 * The path a module uses to surface its own contextual help:
 *
 *   const help = await contextualKnowledge({ contextKey: "commission-overview" })
 *
 * An empty array means nothing has been written yet, and the caller renders
 * nothing rather than inventing content.
 */
export const contextualKnowledge = cache(async function contextualKnowledge({
  contextKey,
  roleIds = [],
  departmentSlugs = [],
  limit = 4,
}: {
  contextKey: string;
  roleIds?: readonly string[];
  departmentSlugs?: readonly string[];
  limit?: number;
}) {
  const { items, links } = await loadKnowledgeRows();
  const departmentIds = await departmentIdsForSlugs(departmentSlugs);

  return knowledgeForContext(items, {
    contextKey,
    roleIds,
    departmentIds,
    links,
    limit,
  });
});

async function departmentIdsForSlugs(slugs: readonly string[]): Promise<string[]> {
  if (slugs.length === 0) return [];

  const catalog = await loadExperienceCatalog();

  return catalog.departments
    .filter((department) => slugs.includes(department.slug))
    .map((department) => department.id);
}
