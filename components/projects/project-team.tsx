"use client";

import { useActionState, useState } from "react";

import { ActionButtonForm } from "@/components/ui/action-button-form";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Select, SubmitButton, TextInput } from "@/components/ui/form";
import {
  addProjectTeamMember,
  removeProjectTeamMember,
  updateProjectTeamMember,
  type ProjectTeamMember,
  type ProjectTeamOption,
} from "@/lib/projects/team";

export function ProjectTeam({
  jobId,
  members,
  options,
  canEdit,
  salesDesignerId,
  salesDesignerName,
}: {
  jobId: string;
  members: ProjectTeamMember[];
  options: ProjectTeamOption[];
  canEdit: boolean;
  salesDesignerId: string | null;
  salesDesignerName: string;
}) {
  const [adding, setAdding] = useState(false);
  const explicitIds = new Set(members.map((member) => member.profileId));
  const showDesigner = salesDesignerId && !explicitIds.has(salesDesignerId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {showDesigner ? (
          <TeamRow name={salesDesignerName} role="Sales designer" />
        ) : null}
        {members.map((member) => (
          <EditableTeamRow key={member.id} jobId={jobId} member={member} canEdit={canEdit} />
        ))}
        {!showDesigner && members.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">No project team members assigned.</p>
        ) : null}
      </div>

      {canEdit ? (
        <div className="border-t border-line pt-4">
          {adding ? (
            <AddTeamMemberForm
              jobId={jobId}
              options={options.filter((option) => !explicitIds.has(option.id) && option.id !== salesDesignerId)}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Edit project team
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TeamRow({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2.5">
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs text-ink-muted">{role}</p>
      </div>
    </div>
  );
}

function EditableTeamRow({
  jobId,
  member,
  canEdit,
}: {
  jobId: string;
  member: ProjectTeamMember;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateProjectTeamMember, undefined);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg px-1 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={member.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{member.name}</p>
            <p className="text-xs text-ink-muted">{member.roleLabel}</p>
          </div>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-ink-muted hover:text-ink">
            Edit
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="memberId" value={member.id} />
      <div className="flex items-center gap-3">
        <Avatar name={member.name} />
        <p className="text-sm font-semibold text-ink">{member.name}</p>
      </div>
      <Field label="Project role" htmlFor={`team-role-${member.id}`}>
        <TextInput id={`team-role-${member.id}`} name="roleLabel" defaultValue={member.roleLabel} required />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label="Save role" pendingLabel="Saving…" size="sm" />
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        <ActionButtonForm
          action={removeProjectTeamMember}
          fields={{ jobId, memberId: member.id }}
          label="Remove"
          pendingLabel="Removing…"
          size="sm"
        />
      </div>
      <FormAlert state={state} />
    </form>
  );
}

function AddTeamMemberForm({
  jobId,
  options,
  onCancel,
}: {
  jobId: string;
  options: ProjectTeamOption[];
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(addProjectTeamMember, undefined);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-surface-muted/40 p-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Team member" htmlFor={`team-member-${jobId}`}>
          <Select id={`team-member-${jobId}`} name="profileId" required defaultValue="">
            <option value="" disabled>Select a person</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Project role" htmlFor={`team-new-role-${jobId}`}>
          <TextInput id={`team-new-role-${jobId}`} name="roleLabel" placeholder="Project Manager" required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label="Add team member" pendingLabel="Adding…" size="sm" />
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <FormAlert state={state} />
    </form>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "—";

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
      {initials}
    </div>
  );
}
