import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { InfoIcon } from "@/components/icons";
import type { RoleAssignment } from "@/lib/experience/assignment";
import type { ExperienceCatalog } from "@/lib/experience/catalog-types";
import type { RoleExperience, RoleResolutionSource } from "@/lib/experience/types";
import { formatText } from "@/lib/utils/format";

/**
 * Says, plainly, which role experience is being rendered and whether it was
 * resolved cleanly.
 *
 * Both notices are load-bearing. When a person has no business role assigned yet,
 * they should see why their app looks the way it does — not silently get a
 * half-empty portal. When the configuration tables are unreachable and the code
 * registry is standing in, an administrator should know that their edits are not
 * what is on screen.
 */
export function RoleContext({
  experience,
  assignment,
  catalogSource,
  catalogNote,
}: {
  experience: RoleExperience;
  assignment: RoleAssignment;
  catalogSource: ExperienceCatalog["source"];
  catalogNote: string | null;
}) {
  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-subtle">Business role</dt>
          <dd className="font-medium text-ink">{experience.roleName}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-subtle">Department</dt>
          <dd className="font-medium text-ink">
            {formatText(assignment.departmentName, "Company-wide")}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-subtle">Resolution</dt>
          <dd className="text-ink-muted">{resolutionLabel(assignment.source)}</dd>
        </div>
      </dl>

      {assignment.source === "unassigned" ? (
        <ConfigurationNotice
          title="No business role is assigned to this profile"
          description="The baseline experience is being shown: Home, Requests, People and Knowledge. An administrator can assign a business role under Admin → Users, which changes only what this person sees — never what they are allowed to do."
        />
      ) : null}

      {catalogSource === "registry" ? (
        <ConfigurationNotice
          title="Role configuration is showing the built-in defaults"
          description={
            catalogNote ??
            "The role experience tables could not be read, so the code registry is being used. Apply supabase/migrations/20260915230000_business_architecture.sql and the seed beside it to manage this configuration from Admin → Roles."
          }
        />
      ) : null}

      {experience.blockedModules.length > 0 ? (
        <p className="flex items-start gap-2 text-xs leading-5 text-ink-subtle">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {experience.blockedModules.length} module
            {experience.blockedModules.length === 1 ? " is" : "s are"} hidden from this
            experience because this account&apos;s security role does not hold the capability
            they need. Configuration decides what is shown; the security role decides what is
            allowed.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function resolutionLabel(source: RoleResolutionSource) {
  switch (source) {
    case "assigned":
      return "Assigned business role";
    case "auth_role_fallback":
      return "Fallback from the security role";
    default:
      return "No assignment";
  }
}
