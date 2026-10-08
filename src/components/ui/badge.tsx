import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const styles = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  muted: "bg-muted/15 text-muted",
} as const;

export function Badge({
  tone,
  children,
}: {
  tone: keyof typeof styles;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}
