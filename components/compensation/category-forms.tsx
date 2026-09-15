"use client";

import { useActionState } from "react";

import {
  CheckboxField,
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { saveProjectCategory } from "@/lib/compensation/actions";
import { fromDecimalPercent } from "@/lib/utils/percent";
import type { ProjectCategoryRow } from "@/lib/supabase/database.types";

const GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.9fr_0.6fr_auto]";

/**
 * Create form and per-row edit form for project categories. Both post to the
 * same Server Action; the presence of an id decides insert vs update.
 */
export function ProjectCategoryCreateForm() {
  const [state, formAction] = useActionState(saveProjectCategory, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className={GRID}>
        <Field label="Name" htmlFor="new-category-name" error={fieldError(state, "name")}>
          <TextInput
            id="new-category-name"
            name="name"
            placeholder="Kitchen"
            required
            invalid={Boolean(fieldError(state, "name"))}
          />
        </Field>
        <Field label="Code" htmlFor="new-category-code" error={fieldError(state, "code")}>
          <TextInput
            id="new-category-code"
            name="code"
            placeholder="KIT"
            required
            invalid={Boolean(fieldError(state, "code"))}
          />
        </Field>
        <Field
          label="Minimum GP standard (%)"
          htmlFor="new-category-gp"
          error={fieldError(state, "minimumGpStandardPercent")}
        >
          <TextInput
            id="new-category-gp"
            name="minimumGpStandardPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue="36"
            required
          />
        </Field>
        <Field label="Sort order" htmlFor="new-category-sort" error={fieldError(state, "sortOrder")}>
          <TextInput
            id="new-category-sort"
            name="sortOrder"
            type="number"
            step="1"
            min="0"
            defaultValue="0"
          />
        </Field>
        <div className="flex items-end pb-1">
          <CheckboxField label="Active" name="active" defaultChecked />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Add category" pendingLabel="Adding…" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function ProjectCategoryEditForm({ category }: { category: ProjectCategoryRow }) {
  const [state, formAction] = useActionState(saveProjectCategory, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={category.id} />
      <div className={GRID}>
        <Field
          label="Name"
          htmlFor={`category-name-${category.id}`}
          error={fieldError(state, "name")}
        >
          <TextInput
            id={`category-name-${category.id}`}
            name="name"
            defaultValue={category.name}
            required
          />
        </Field>
        <Field
          label="Code"
          htmlFor={`category-code-${category.id}`}
          error={fieldError(state, "code")}
        >
          <TextInput
            id={`category-code-${category.id}`}
            name="code"
            defaultValue={category.code}
            required
          />
        </Field>
        <Field
          label="Minimum GP standard (%)"
          htmlFor={`category-gp-${category.id}`}
          error={fieldError(state, "minimumGpStandardPercent")}
        >
          <TextInput
            id={`category-gp-${category.id}`}
            name="minimumGpStandardPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={fromDecimalPercent(category.minimum_gp_standard) ?? ""}
            required
          />
        </Field>
        <Field
          label="Sort order"
          htmlFor={`category-sort-${category.id}`}
          error={fieldError(state, "sortOrder")}
        >
          <TextInput
            id={`category-sort-${category.id}`}
            name="sortOrder"
            type="number"
            step="1"
            min="0"
            defaultValue={category.sort_order}
          />
        </Field>
        <div className="flex items-end pb-1">
          <CheckboxField label="Active" name="active" defaultChecked={category.active} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
