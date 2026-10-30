"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Trash2, ImagePlus, Pencil, X } from "lucide-react";
import type { Photo } from "@/lib/types";
import { addPhoto, deletePhoto, updatePhotoCaption } from "@/lib/db";
import { refreshSitefold } from "@/hooks/use-sitefold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/time";

function PhotoThumb({
  photo,
  onOpen,
}: {
  photo: Photo;
  onOpen: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-2xl bg-[oklch(0.92_0.01_95)] text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[oklch(0.45_0.05_155)]"
      aria-label={
        photo.caption
          ? `View photo: ${photo.caption}`
          : `View photo from ${formatDateTime(photo.createdAt)}`
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={photo.caption || "Job photo"}
        className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-[11px] text-white">
        <span>{formatDateTime(photo.createdAt)}</span>
        {photo.caption ? (
          <span className="line-clamp-2 font-medium leading-snug">
            {photo.caption}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function PhotoLightbox({
  photo,
  onClose,
  onDelete,
  onSaveCaption,
}: {
  photo: Photo;
  onClose: () => void;
  onDelete: () => void;
  onSaveCaption: (caption: string) => Promise<void>;
}) {
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [caption, setCaption] = useState(photo.caption);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !editing) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  async function save() {
    setSaving(true);
    try {
      await onSaveCaption(caption);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[oklch(0.14_0.01_155)]"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-white">
        <p className="min-w-0 truncate text-sm text-white/80">
          {formatDateTime(photo.createdAt)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Edit caption"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white hover:bg-red-600/80 hover:text-white"
            aria-label="Delete photo"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Close photo"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={photo.caption || "Job photo"}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <div className="border-t border-white/10 bg-black/50 px-4 py-3 text-white">
        {editing ? (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="lightbox-caption" className="text-white/70">
                Caption
              </Label>
              <Input
                id="lightbox-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Before, after, room, defect…"
                className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setCaption(photo.caption);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void save()}
                className="bg-[oklch(0.82_0.12_75)] text-[oklch(0.25_0.04_155)] hover:bg-[oklch(0.78_0.12_75)]"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mx-auto block w-full max-w-lg text-left text-sm"
          >
            {photo.caption ? (
              <span className="leading-relaxed">{photo.caption}</span>
            ) : (
              <span className="text-white/55">Tap to add a caption…</span>
            )}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function PhotoGallery({
  jobId,
  photos,
}: {
  jobId: string;
  photos: Photo[];
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState<{
    files: File[];
  } | null>(null);
  const [pendingCaption, setPendingCaption] = useState("");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const lightboxPhoto = photos.find((p) => p.id === lightboxId) ?? null;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!images.length) return;
    setPendingCaption("");
    setCaptionPrompt({ files: images });
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  async function saveWithCaption(skip: boolean) {
    if (!captionPrompt || busy) return;
    setBusy(true);
    const caption = skip ? "" : pendingCaption.trim();
    const files = captionPrompt.files;
    let saved = 0;
    try {
      for (const file of files) {
        await addPhoto(jobId, file, caption);
        saved += 1;
      }
      setCaptionPrompt(null);
      setPendingCaption("");
    } catch (e) {
      const reason =
        e instanceof Error && e.name === "QuotaExceededError"
          ? "This device is out of storage for Job Snap. Make a full backup, then free up space."
          : e instanceof Error
            ? e.message
            : "Unknown error.";
      // Keep only the unsaved files in the prompt so Save retries just those.
      setCaptionPrompt({ files: files.slice(saved) });
      alert(
        `Saved ${saved} of ${files.length} photo${files.length === 1 ? "" : "s"}. ${reason}`,
      );
    } finally {
      refreshSitefold();
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    try {
      await deletePhoto(id);
      if (lightboxId === id) setLightboxId(null);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete photo");
    }
  }

  async function onSaveCaption(id: string, caption: string) {
    try {
      await updatePhotoCaption(id, caption);
      refreshSitefold();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save caption");
      throw e;
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-[oklch(0.28_0.04_155)]">
          Photos
        </h2>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => libraryRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Library
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)] hover:bg-[oklch(0.28_0.05_155)]"
          >
            <Camera className="h-4 w-4" />
            Take
          </Button>
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[oklch(0.45_0.04_155_/0.35)] bg-[oklch(0.96_0.01_95)] px-4 py-10 text-sm text-muted-foreground transition hover:border-[oklch(0.45_0.04_155_/0.55)]"
        >
          <Camera className="h-7 w-7 text-[oklch(0.45_0.05_155)]" />
          Snap a site photo — it stays with this job
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo) => (
            <PhotoThumb
              key={photo.id}
              photo={photo}
              onOpen={() => setLightboxId(photo.id)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!captionPrompt}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCaptionPrompt(null);
            setPendingCaption("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Caption
              {captionPrompt && captionPrompt.files.length > 1
                ? ` (${captionPrompt.files.length} photos)`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-photo-caption">Optional label</Label>
            <Input
              id="new-photo-caption"
              value={pendingCaption}
              onChange={(e) => setPendingCaption(e.target.value)}
              placeholder="Before drywall, serial #, front yard…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveWithCaption(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Captions show in the gallery and travel with export ZIP / CSV.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void saveWithCaption(true)}
            >
              Skip
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void saveWithCaption(false)}
              className="bg-[oklch(0.32_0.05_155)] text-[oklch(0.97_0.02_95)] hover:bg-[oklch(0.28_0.05_155)]"
            >
              {busy ? "Saving…" : "Save photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxPhoto ? (
        <PhotoLightbox
          key={`${lightboxPhoto.id}:${lightboxPhoto.caption}`}
          photo={lightboxPhoto}
          onClose={() => setLightboxId(null)}
          onDelete={() => void onDelete(lightboxPhoto.id)}
          onSaveCaption={(caption) => onSaveCaption(lightboxPhoto.id, caption)}
        />
      ) : null}
    </section>
  );
}
