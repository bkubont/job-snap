"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when IndexedDB can't be read. Says plainly that data is not
 * necessarily lost, so nobody re-imports or restores over it in a panic.
 */
export function LoadError({
  error,
  onRetry,
  what = "your data",
}: {
  error: Error;
  onRetry: () => void;
  what?: string;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">Couldn&apos;t load {what}.</p>
          <p className="text-muted-foreground">
            This doesn&apos;t mean anything was deleted. The browser blocked
            access to Job Snap&apos;s storage on this device (private browsing,
            low storage, or a browser hiccup). Try again, or close and reopen
            the app.
          </p>
          <p className="break-words text-xs text-muted-foreground">
            Details: {error.message}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Small inline save indicator for autosaving fields. */
export function SaveStatus({
  status,
  dirty,
  error,
  onRetry,
  idleLabel = "Autosaved",
}: {
  status: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
  error: string | null;
  onRetry: () => void;
  idleLabel?: string;
}) {
  if (status === "error") {
    return (
      <span role="alert" className="text-xs font-medium text-destructive">
        Not saved{error ? ` (${error})` : ""} ·{" "}
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2"
        >
          Retry
        </button>
      </span>
    );
  }
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : dirty
          ? "Editing…"
          : idleLabel;
  return (
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
  );
}
