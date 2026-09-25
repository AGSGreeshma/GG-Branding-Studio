/** Named loading state: never just "Loading…" (plan §10, E7). */
export function LoadingStatus({ message, className = "" }: { message: string; className?: string }) {
  return (
    <p
      aria-live="polite"
      className={`flex items-center gap-2.5 text-sm text-muted-foreground ${className}`}
    >
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {message}
    </p>
  );
}
