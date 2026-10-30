"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as db from "@/lib/db";
import type { ActivePunchInfo, DayNote } from "@/lib/types";
import { todayKey } from "@/lib/time";

let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

function useDbVersion() {
  return useSyncExternalStore(subscribe, getVersion, () => 0);
}

function toError(e: unknown) {
  return e instanceof Error
    ? e
    : new Error("Could not read data stored on this device.");
}

type QueryState<T> = { key: string; data?: T; error: Error | null };

/**
 * Re-runs `load` whenever `key` changes or any write calls refreshSitefold().
 * Keeps the last result for the same key while refreshing (no "Loading…"
 * flash after every save) and surfaces read failures as `error` instead of
 * leaving screens stuck or showing a misleading empty state.
 * Pass `key = null` to skip loading.
 */
function useDbQuery<T>(key: string | null, load: () => Promise<T>) {
  const v = useDbVersion();
  const [state, setState] = useState<QueryState<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ key, data, error: null });
      },
      (err) => {
        if (cancelled) return;
        setState((prev) => ({
          key,
          data: prev?.key === key ? prev.data : undefined,
          error: toError(err),
        }));
      },
    );
    return () => {
      cancelled = true;
    };
    // `key` captures every input of `load`; `v` re-runs after writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);

  const current = state && state.key === key ? state : null;
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: key !== null && !current,
    retry: bump,
  };
}

export function useContacts() {
  const q = useDbQuery("contacts", db.listContacts);
  return {
    contacts: q.data ?? [],
    loading: q.loading,
    error: q.error,
    retry: q.retry,
    refresh: bump,
  };
}

export function useContact(contactId: string | undefined) {
  const q = useDbQuery(contactId ? `contact:${contactId}` : null, () =>
    Promise.all([
      db.getContact(contactId!),
      db.listJobsForContact(contactId!),
    ]),
  );
  return {
    // undefined = loading, null = not found
    contact: q.data ? (q.data[0] ?? null) : undefined,
    jobs: q.data?.[1] ?? [],
    error: q.error,
    retry: q.retry,
    refresh: bump,
  };
}

export function useJob(jobId: string | undefined) {
  const q = useDbQuery(jobId ? `job:${jobId}` : null, async () => {
    const job = await db.getJob(jobId!);
    if (!job) return { job: null, contact: null, punches: [], photos: [] };
    const [contact, punches, photos] = await Promise.all([
      db.getContact(job.contactId),
      db.listPunchesForJob(jobId!),
      db.listPhotosForJob(jobId!),
    ]);
    return { job, contact: contact ?? null, punches, photos };
  });
  return {
    // undefined = loading, null = not found
    job: q.data ? q.data.job : undefined,
    contact: q.data?.contact ?? null,
    punches: q.data?.punches ?? [],
    photos: q.data?.photos ?? [],
    error: q.error,
    retry: q.retry,
    refresh: bump,
  };
}

export function useActivePunch() {
  const q = useDbQuery("open-punches", db.listOpenPunches);
  const open: ActivePunchInfo[] = q.data ?? [];
  return {
    /** Most recent open punch (the running timer). */
    active: open[open.length - 1] ?? null,
    /** All open punches; more than one needs the user's attention. */
    openPunches: open,
    error: q.error,
    refresh: bump,
  };
}

export function useRecentJobs(limit = 5) {
  const q = useDbQuery(`recent:${limit}`, () => db.listRecentJobs(limit));
  return { recent: q.data ?? [], error: q.error, refresh: bump };
}

export function useDayNote(date: string | null) {
  const q = useDbQuery(date ? `day-note:${date}` : null, () =>
    db.getDayNote(date!),
  );

  const save = useCallback(
    async (body: string) => {
      if (!date) throw new Error("No date selected.");
      const saved = await db.upsertDayNote(date, body);
      bump();
      return saved;
    },
    [date],
  );

  return {
    note: (q.data ?? null) as DayNote | null,
    loading: q.loading,
    error: q.error,
    retry: q.retry,
    save,
    refresh: bump,
  };
}

export function useDayNotes() {
  const q = useDbQuery("day-notes", db.listDayNotes);
  return { notes: q.data ?? [], error: q.error, refresh: bump };
}

/**
 * Debounced autosave for a text field. Saves `AUTOSAVE_MS` after typing stops,
 * and immediately when the page is hidden or closed (iPhone lock screen,
 * app switch, swipe away) — so notes never depend on the field losing focus.
 */
export function useAutosave(
  saved: string,
  persist: (value: string) => Promise<unknown>,
  delayMs = 600,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== null && draft !== saved;

  // Callers usually pass an inline function; read it through a ref so a
  // re-render doesn't restart the debounce timer.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  const flush = useCallback(
    async (value: string | null = draft) => {
      if (value === null || value === saved) return;
      setStatus("saving");
      setError(null);
      try {
        await persistRef.current(value);
        // Keep the draft: it equals the saved value once the store refreshes,
        // and clearing it early would flash the old text.
        setStatus("saved");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    },
    [draft, saved],
  );

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => void flush(), delayMs);
    return () => window.clearTimeout(t);
  }, [dirty, flush, delayMs]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    const onPageHide = () => void flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving the screen (client navigation) also saves.
      void flushRef.current();
    };
  }, []);

  useEffect(() => {
    if (status !== "saved") return;
    const t = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(t);
  }, [status]);

  return {
    value: draft ?? saved,
    setValue: setDraft,
    dirty,
    status,
    error,
    flush,
    /** Drop an unsaved draft (e.g. after switching which record is shown). */
    reset: () => setDraft(null),
  };
}

const noopSubscribe = () => () => {};

/**
 * Today's date (YYYY-MM-DD), read only in the browser; null during the server
 * prerender. Reading the clock while rendering on the server aborts the Cache
 * Components prerender and left whole pages on "Loading Job Snap…".
 */
export function useToday() {
  return useSyncExternalStore(noopSubscribe, todayKey, () => null);
}

export { bump as refreshSitefold };
