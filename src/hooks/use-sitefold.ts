"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as db from "@/lib/db";
import type {
  ActivePunchInfo,
  Contact,
  DayNote,
  Job,
  Photo,
  Punch,
} from "@/lib/types";

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

export function useContacts() {
  const v = useDbVersion();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    db.listContacts()
      .then((rows) => {
        if (!cancelled) setContacts(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [v]);

  return { contacts, loading, refresh: bump };
}

export function useContact(contactId: string | undefined) {
  const v = useDbVersion();
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    Promise.all([db.getContact(contactId), db.listJobsForContact(contactId)]).then(
      ([c, j]) => {
        if (!cancelled) {
          setContact(c ?? null);
          setJobs(j);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contactId, v]);

  return { contact, jobs, refresh: bump };
}

export function useJob(jobId: string | undefined) {
  const v = useDbVersion();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [contact, setContact] = useState<Contact | null>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      const j = await db.getJob(jobId);
      if (!j) {
        if (!cancelled) setJob(null);
        return;
      }
      const [c, p, ph] = await Promise.all([
        db.getContact(j.contactId),
        db.listPunchesForJob(jobId),
        db.listPhotosForJob(jobId),
      ]);
      if (!cancelled) {
        setJob(j);
        setContact(c ?? null);
        setPunches(p);
        setPhotos(ph);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, v]);

  return { job, contact, punches, photos, refresh: bump };
}

export function useActivePunch() {
  const v = useDbVersion();
  const [active, setActive] = useState<ActivePunchInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    db.getOpenPunch().then((info) => {
      if (!cancelled) setActive(info);
    });
    return () => {
      cancelled = true;
    };
  }, [v]);

  return { active, refresh: bump };
}

export function useDayNote(date: string) {
  const v = useDbVersion();
  const [note, setNote] = useState<DayNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    db.getDayNote(date)
      .then((n) => {
        if (!cancelled) setNote(n);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, v]);

  const save = useCallback(async (body: string) => {
    const saved = await db.upsertDayNote(date, body);
    bump();
    return saved;
  }, [date]);

  return { note, loading, save, refresh: bump };
}

export function useDayNotes() {
  const v = useDbVersion();
  const [notes, setNotes] = useState<DayNote[]>([]);

  useEffect(() => {
    let cancelled = false;
    db.listDayNotes().then((rows) => {
      if (!cancelled) setNotes(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [v]);

  return { notes, refresh: bump };
}

export { bump as refreshSitefold };
