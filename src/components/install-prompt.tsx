"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  dismissInstallCue,
  isInstallCueDismissed,
} from "@/lib/backup";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstallCueDismissed()) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) return;

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);

    const onBip = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS has no beforeinstallprompt — show Share tip after a beat
    let timer: number | undefined;
    if (ios) {
      timer = window.setTimeout(() => setVisible(true), 900);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    dismissInstallCue();
    setVisible(false);
  }

  async function onInstall() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  }

  if (!visible) return null;
  if (!isIos && !deferred) return null;

  return (
    <div className="border-b border-[oklch(0.35_0.03_155_/0.12)] bg-[oklch(0.94_0.03_85_/0.95)] px-4 py-2 print:hidden">
      <div className="mx-auto flex max-w-lg items-start gap-2">
        <div className="min-w-0 flex-1 text-xs leading-snug text-[oklch(0.28_0.04_155)]">
          {deferred ? (
            <>
              <span className="font-medium">Install Job Snap</span>
              {" — "}
              add it to your home screen for a full-screen clock.
            </>
          ) : (
            <>
              <span className="font-medium">Add to Home Screen</span>
              {" — "}
              tap Share
              <Share className="mx-0.5 inline h-3 w-3 align-text-bottom" />
              then <span className="font-medium">Add to Home Screen</span>.
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {deferred ? (
            <Button size="sm" className="h-7 px-2 text-xs" onClick={onInstall}>
              <Download className="h-3.5 w-3.5" />
              Install
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7"
            onClick={dismiss}
            aria-label="Dismiss install tip"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
