import { EmptyState } from "@/components/empty-state/empty-state";
import { KnowledgeIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSessionExperience } from "@/lib/experience/queries";
import {
  KNOWLEDGE_TYPE_HINTS,
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_TYPE_ORDER,
  groupKnowledgeItemsByType,
} from "@/lib/knowledge/model";
import { listKnowledgeItems } from "@/lib/knowledge/queries";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Knowledge",
};

/**
 * Knowledge (BOS).
 *
 * Secondary support content inside the operating app, not the product itself. This
 * page is the metadata foundation made visible: it lists whatever published
 * knowledge is in scope for the signed-in person's role and department, and groups
 * it by the eight content types the model supports.
 *
 * No content has been migrated from Notion, and none has been invented to fill the
 * page out. What it shows instead is the structure that content will drop into.
 */
export default async function KnowledgePage() {
  const state = await requireSessionExperience();
  const { experience, assignment } = state;

  const items = await listKnowledgeItems({
    roleIds: assignment.businessRoleId ? [assignment.businessRoleId] : [],
    departmentSlugs: experience.knowledgeScope.departmentSlug
      ? [experience.knowledgeScope.departmentSlug]
      : [],
  });

  const groups = groupKnowledgeItemsByType(items);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge"
        title="Knowledge"
        description="Training, SOPs, role expectations, playbooks, forms, documents, policies and decision guides — the supporting content for how the business runs."
      />

      <Panel
        id="knowledge-scope"
        title="What you are looking at"
        description="Knowledge is scoped by role, department, content type and a context key that any screen can ask for."
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <ScopeItem label="Your role" value={experience.roleName} />
          <ScopeItem
            label="Department scope"
            value={formatText(experience.departmentName, "Company-wide")}
          />
          <ScopeItem label="Items in scope" value={`${items.length}`} />
        </dl>
      </Panel>

      {groups.length === 0 ? (
        <EmptyState
          icon={<KnowledgeIcon className="h-5 w-5" />}
          title="No knowledge content yet"
          description="The metadata foundation is in place and scoping works, but nothing has been migrated from Notion yet and no sample content has been invented. The content types below are what will appear here."
        />
      ) : (
        groups.map((group) => (
          <Panel
            key={group.type}
            id={`knowledge-${group.type}`}
            title={`${group.label} (${group.items.length})`}
            description={KNOWLEDGE_TYPE_HINTS[group.type]}
          >
            <ul className="divide-y divide-line text-sm">
              {group.items.map((item) => (
                <li key={item.id} className="space-y-0.5 py-3">
                  <p className="font-medium text-ink">{item.title}</p>
                  {item.description ? (
                    <p className="text-sm leading-6 text-ink-muted">{item.description}</p>
                  ) : null}
                  {item.context_key ? (
                    <p className="font-mono text-xs text-ink-subtle">{item.context_key}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}

      <Panel
        id="knowledge-types"
        title="Content types this model supports"
        description="Eight types, one table. Adding a type is a schema decision, not a new module."
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KNOWLEDGE_TYPE_ORDER.map((type) => (
            <li key={type} className="space-y-1 rounded-lg border border-line bg-surface-muted p-4">
              <p className="text-sm font-medium text-ink">{KNOWLEDGE_TYPE_LABELS[type]}</p>
              <p className="text-xs leading-5 text-ink-muted">{KNOWLEDGE_TYPE_HINTS[type]}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        id="knowledge-contextual"
        title="Contextual help"
        description="A screen can ask for the knowledge that belongs to it by context key — for example commission-overview on the commission screens, or inventory-receiving on the receiving screen."
      >
        <p className="text-sm leading-6 text-ink-muted">
          The path exists and is tested: modules call <code>contextualKnowledge()</code> with
          their own context key and render whatever is published for it, or nothing at all. No
          screen has hardcoded help text, and no content has been written on the screen&apos;s
          behalf.
        </p>
      </Panel>
    </div>
  );
}

function ScopeItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}
