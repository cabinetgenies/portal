import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-line bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({
  children,
  className,
  caption,
}: {
  children: ReactNode;
  className?: string;
  caption?: string;
}) {
  return (
    <table className={cn("w-full min-w-max text-left text-sm", className)}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  );
}

export function Th({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line bg-surface-muted px-4 py-2.5 text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td
      className={cn("border-b border-line px-4 py-3 align-top text-ink", className)}
      {...props}
    >
      {children}
    </td>
  );
}

export function TdNumeric({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Td className={cn("text-right font-mono text-[0.8125rem] tabular-nums", className)}>
      {children}
    </Td>
  );
}
