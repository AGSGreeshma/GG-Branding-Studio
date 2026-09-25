"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Human-readable error with a way out (plan §10, E8).
 * `message` is always the user-safe message from the API, never a stack trace.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 ${className}`}
    >
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span>{message}</span>
      </p>
      {onRetry ? (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RotateCcwIcon className="size-3.5" aria-hidden />
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
