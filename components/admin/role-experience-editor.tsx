"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/ui/form";
import {
  moveRoleExperienceAssignment,
  setRoleExperienceVisibility,
} from "@/lib/admin/experience-actions";
import type { ExperienceKind } from "@/lib/experience/kinds";
import { cn } from "@/lib/utils/cn";

export type RoleExperienceEntry = {
  key: string;
  label: string;
  description: string;
  isVisible: boolean;
  displayOrder: number;
  /** Extra line under the description — a route, a capability note, a reason. */
  meta?: string | null;
};

/**
 * The minimal, safe configuration control for a role.
 *
 * Show/hide and move one place up or down — deliberately not a drag-and-drop
 * dashboard builder and not a page builder. The data model is the point of this
 * phase; the editing surface only needs to be honest and reversible.
 *
 * Every row is its own form, so a change is a single, attributable write, and the
 * action reports back through the shared action state.
 */
export function RoleExperienceEditor({
  roleId,
  kind,
  entries,
  emptyMessage,
}: {
  roleId: string;
  kind: ExperienceKind;
  entries: readonly RoleExperienceEntry[];
  emptyMessage: string;
}) {
  const [visibilityState, setVisibility] = useActionState(
    setRoleExperienceVisibility,
    undefined,
  );
  const [orderState, setOrder] = useActionState(moveRoleExperienceAssignment, undefined);

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FormAlert state={visibilityState ?? orderState} />

      <ul className="divide-y divide-line rounded-xl border border-line">
        {entries.map((entry, index) => (
          <li
            key={entry.key}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
                {entry.label}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.68rem] font-medium tracking-wide uppercase",
                    entry.isVisible
                      ? "border-line bg-accent-soft text-accent-strong"
                      : "border-dashed border-line-strong text-ink-subtle",
                  )}
                >
                  {entry.isVisible ? "Shown" : "Hidden"}
                </span>
              </p>
              <p className="text-sm leading-5 text-ink-muted">{entry.description}</p>
              {entry.meta ? (
                <p className="font-mono text-xs text-ink-subtle">{entry.meta}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <form action={setVisibility}>
                <input type="hidden" name="roleId" value={roleId} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="key" value={entry.key} />
                <input type="hidden" name="visible" value={entry.isVisible ? "false" : "true"} />
                <SubmitButton
                  label={entry.isVisible ? "Hide" : "Show"}
                  pendingLabel="Saving…"
                  variant="secondary"
                  size="sm"
                />
              </form>

              <form action={setOrder}>
                <input type="hidden" name="roleId" value={roleId} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="key" value={entry.key} />
                <input type="hidden" name="direction" value="up" />
                <SubmitButton
                  label="↑"
                  pendingLabel="…"
                  variant="ghost"
                  size="sm"
                  className="w-9 px-0"
                />
                <span className="sr-only">Move {entry.label} up</span>
                {index === 0 ? <span className="sr-only">(already first)</span> : null}
              </form>

              <form action={setOrder}>
                <input type="hidden" name="roleId" value={roleId} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="key" value={entry.key} />
                <input type="hidden" name="direction" value="down" />
                <SubmitButton
                  label="↓"
                  pendingLabel="…"
                  variant="ghost"
                  size="sm"
                  className="w-9 px-0"
                />
                <span className="sr-only">Move {entry.label} down</span>
                {index === entries.length - 1 ? (
                  <span className="sr-only">(already last)</span>
                ) : null}
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
