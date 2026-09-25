import type { ReactNode } from "react";

/** Every area has an empty state that explains what will appear here (plan §10, E12). */
export function EmptyState({
  title,
  description,
  icon,
  className = "",
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-5 py-8 text-center ${className}`}
    >
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
        {description}
      </p>
    </div>
  );
}
