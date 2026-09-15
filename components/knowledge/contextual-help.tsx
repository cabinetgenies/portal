import { KnowledgeIcon } from "@/components/icons";
import { knowledgeTypeLabel } from "@/lib/knowledge/model";
import type { KnowledgeItemRow } from "@/lib/supabase/database.types";

/**
 * Contextual help.
 *
 * The path a module uses to surface its own supporting knowledge:
 *
 *   const help = await contextualKnowledge({ contextKey: "commission-overview" });
 *   <ContextualHelp items={help} contextKey="commission-overview" />
 *
 * It renders nothing at all when there is nothing written for that context, which
 * is the honest state today: the metadata foundation exists, the content has not
 * been migrated yet.
 */
export function ContextualHelp({
  items,
  contextKey,
}: {
  items: readonly KnowledgeItemRow[];
  contextKey: string;
}) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Related knowledge"
      data-context-key={contextKey}
      className="space-y-3 rounded-xl border border-line bg-surface-muted p-4"
    >
      <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
        <KnowledgeIcon className="h-3.5 w-3.5" />
        Related knowledge
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-4">
            <span className="font-medium text-ink">{item.title}</span>
            <span className="shrink-0 text-xs text-ink-subtle">
              {knowledgeTypeLabel(item.type)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
