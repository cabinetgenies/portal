import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type IconProps = {
  className?: string;
};

function Icon({
  className,
  children,
}: IconProps & {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function SalesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 17.5 9 12l3.5 3.5L20.5 7" />
      <path d="M15.5 7h5v5" />
    </Icon>
  );
}

export function ProjectsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l1.8 2.2h7a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2Z" />
    </Icon>
  );
}

export function ProductionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 20.5v-8l4 2.5v-3l4 2.5v-3l4 2.5v-6l5 3v9.5Z" />
      <path d="M6.5 20.5v-2.2M10.5 20.5v-2.2M14.5 20.5v-2.2" />
    </Icon>
  );
}

export function CommissionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5h11v17l-2.2-1.5-2.3 1.5-2.3-1.5-2.2 1.5Z" />
      <path d="M9.5 8.5h5M9.5 12.5h5" />
    </Icon>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20.5h16" />
      <path d="M7 20.5v-6M12 20.5V7M17 20.5v-9" />
    </Icon>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.2 5 6v5.4c0 4 2.9 7.5 7 9.4 4.1-1.9 7-5.4 7-9.4V6Z" />
      <path d="M9.5 12.2 11.4 14l3.3-3.4" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M4 19.5c.6-3 2.9-4.7 5.5-4.7s4.9 1.7 5.5 4.7" />
      <path d="M16 6.2a3 3 0 0 1 0 5.8M17.5 15.4c1.6.5 2.6 1.7 3 3.4" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 20.5h-8a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h8" />
      <path d="M17 8.5 20.5 12 17 15.5M9.5 12h11" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Icon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12.5h4l2.5-6 3.5 12 2.5-6h4.5" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5 3.5 19.5h17Z" />
      <path d="M12 10v4M12 16.7h.01" />
    </Icon>
  );
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <Icon className={cn("animate-spin", className)}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </Icon>
  );
}

export function InventoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.6 12 3.5l8.5 4.1v8.8L12 20.5l-8.5-4.1Z" />
      <path d="M3.5 7.6 12 11.7l8.5-4.1M12 11.7v8.8" />
    </Icon>
  );
}

export function OperationsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.8 3.6a4.6 4.6 0 0 0-4 6.9L3.9 17.4l2.7 2.7 6.9-6.9a4.6 4.6 0 0 0 6.9-4 4.7 4.7 0 0 0-.2-1.3l-2.9 2.9-2.4-2.4 2.9-2.9a4.7 4.7 0 0 0-3-.9Z" />
    </Icon>
  );
}

export function KnowledgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 4.5h6.2a2.6 2.6 0 0 1 2.6 2.6v12.4a2 2 0 0 0-2-2H5.5Z" />
      <path d="M18.5 4.5h-4.2v13a2 2 0 0 1 2-2h2.2Z" />
      <path d="M8.4 8.6h3.3M8.4 11.8h3.3" />
    </Icon>
  );
}

/**
 * The Google mark, in Google's own brand colours.
 *
 * Deliberately not built from the shared `Icon` wrapper: Google's sign-in
 * branding guidelines call for the four-colour mark, and it is the one icon in
 * the portal that is not the house stroke style.
 */
export function GoogleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}
