"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * In-app replacements for alert() and confirm(): non-blocking toasts and a
 * styled confirmation dialog. Module-level so any handler can call them;
 * <FeedbackHost /> (in the app shell) renders them.
 */

type Tone = "error" | "success" | "info";
type Toast = { id: number; tone: Tone; message: string };
type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
};

let toasts: Toast[] = [];
let confirmRequest: ConfirmRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(tone: Tone, message: string) {
  const id = nextId++;
  // Same message twice in a row (double tap) shows once.
  toasts = [...toasts.filter((t) => t.message !== message), { id, tone, message }].slice(-3);
  emit();
  window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
}

/** Message from an unknown error, or the fallback. */
export function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export const notify = {
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message),
  info: (message: string) => push("info", message),
};

/** Ask the user to confirm; resolves true only if they press the confirm button. */
export function askConfirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest?.resolve(false);
    confirmRequest = { ...options, resolve };
    emit();
  });
}

function settleConfirm(ok: boolean) {
  const req = confirmRequest;
  confirmRequest = null;
  emit();
  req?.resolve(ok);
}

const getToasts = () => toasts;
const getConfirm = () => confirmRequest;
const noToasts: Toast[] = [];

const TONE_STYLE: Record<Tone, string> = {
  error: "bg-[oklch(0.97_0.03_25)] text-[oklch(0.4_0.15_25)] ring-[oklch(0.55_0.2_25_/0.3)]",
  success: "bg-primary text-primary-foreground ring-transparent",
  info: "bg-white text-foreground ring-hairline",
};

const TONE_ICON = { error: AlertTriangle, success: CheckCircle2, info: Info };

export function FeedbackHost() {
  const list = useSyncExternalStore(subscribe, getToasts, () => noToasts);
  const request = useSyncExternalStore(subscribe, getConfirm, () => null);
  // Keep the last request's text while the dialog animates closed.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);

  return (
    <>
      {/* aria-live keeps messages audible even while a modal dialog hides
          the rest of the page from screen readers. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
      >
        {list.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-lg ring-1",
                TONE_STYLE[t.tone],
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss message"
                className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!request} onOpenChange={(open) => !open && settleConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{shown?.title}</DialogTitle>
            {shown?.body ? <DialogDescription>{shown.body}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settleConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant={shown?.destructive ? "destructive" : "default"}
              className={
                shown?.destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => settleConfirm(true)}
            >
              {shown?.confirmLabel ?? "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
