"use client";

import { useActionState } from "react";

import { updateDepartment } from "@/lib/admin/department-actions";
import {
  CheckboxField,
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";

export type DepartmentEditorProps = {
  department: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    ownerProfileId: string | null;
    active: boolean;
  };
  owners: readonly { id: string; name: string }[];
};

/**
 * Basic department edit support, in place rather than on a separate screen: the
 * department list is short and the change is small.
 */
export function DepartmentEditor({ department, owners }: DepartmentEditorProps) {
  const [state, formAction] = useActionState(updateDepartment, undefined);
  const formId = `department-${department.id}`;

  return (
    <details className="group rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink marker:text-ink-subtle">
        Edit department
        <span className="ml-2 font-mono text-xs font-normal text-ink-subtle">
          {department.slug}
        </span>
      </summary>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="departmentId" value={department.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor={`${formId}-name`}
            error={fieldError(state, "name")}
            hint="What people see. The slug stays the same on purpose."
          >
            <TextInput
              id={`${formId}-name`}
              name="name"
              defaultValue={department.name}
              required
              maxLength={80}
              invalid={Boolean(fieldError(state, "name"))}
            />
          </Field>

          <Field
            label="Owner"
            htmlFor={`${formId}-owner`}
            error={fieldError(state, "ownerProfileId")}
            hint="Display and routing only — ownership grants nothing by itself."
          >
            <Select
              id={`${formId}-owner`}
              name="ownerProfileId"
              defaultValue={department.ownerProfileId ?? ""}
            >
              <option value="">No owner</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor={`${formId}-description`}
          error={fieldError(state, "description")}
          hint="One line on what this department is responsible for."
        >
          <TextInput
            id={`${formId}-description`}
            name="description"
            defaultValue={department.description ?? ""}
            maxLength={280}
          />
        </Field>

        <CheckboxField
          label="Active department"
          name="active"
          defaultChecked={department.active}
          hint="An inactive department keeps its history and its role associations."
        />

        <FormAlert state={state} />

        <SubmitButton label="Save department" pendingLabel="Saving…" size="sm" />
      </form>
    </details>
  );
}
