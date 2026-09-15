import {
  ProjectCategoryCreateForm,
  ProjectCategoryEditForm,
} from "@/components/compensation/category-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { listProjectCategories } from "@/lib/compensation/queries";
import { formatPercent } from "@/lib/utils/format";

export const metadata = {
  title: "Project categories",
};

export default async function ProjectCategoriesPage() {
  const session = await requireCapability("manage:compensation-config");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Project categories are managed by administrators"
        description="Your role can view compensation configuration but not change it."
      />
    );
  }

  const categories = await listProjectCategories({ includeInactive: true });

  return (
    <div className="space-y-6">
      <Panel
        id="category-create"
        title="Add a project category"
        description="Categories are configuration records, not code. Each one carries its own minimum GP standard, which compensation tiers can reference instead of a hardcoded number."
      >
        <ProjectCategoryCreateForm />
      </Panel>

      <Panel
        id="category-list"
        title="Configured categories"
        description={`${categories.length} categor${categories.length === 1 ? "y" : "ies"} configured.`}
      >
        {categories.length === 0 ? (
          <EmptyState
            icon={<ProjectsIcon className="h-5 w-5" />}
            title="No project categories yet."
            description="Add the categories Cabinet Genies actually sells — Kitchen, Bathroom, Closet, Outdoor, Appliance and so on — with the minimum GP standard each one carries."
          />
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((category) => (
              <li key={category.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={category.active ? "Active" : "Inactive"}
                    tone={category.active ? "positive" : "neutral"}
                  />
                  <span className="text-xs text-ink-muted">
                    Minimum GP {formatPercent(category.minimum_gp_standard)} · sort order{" "}
                    {category.sort_order}
                  </span>
                </div>
                <ProjectCategoryEditForm category={category} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
