"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/db";

/**
 * Registers the app-shell service worker (does not touch IndexedDB) and asks
 * the browser to keep Job Snap's stored data instead of evicting it.
 */
export function PwaRegister() {
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") {
      // Still register in dev so installability can be smoked; SW is cache-light.
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* ignore registration failures (http, private mode) */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
