"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Trash2, ImagePlus } from "lucide-react";
import type { Photo } from "@/lib/types";
import { addPhoto, deletePhoto } from "@/lib/db";
import { refreshSitefold } from "@/hooks/use-sitefold";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/time";

function PhotoThumb({
  photo,
  onDelete,
}: {
  photo: Photo;
  onDelete: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <figure className="group relative overflow-hidden rounded-2xl bg-[oklch(0.92_0.01_95)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={photo.caption || "Job photo"}
        className="aspect-[4/3] w-full object-cover"
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-[11px] text-white">
        <span>{formatDateTime(photo.createdAt)}</span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg bg-black/40 p-1.5 backdrop-blur-sm transition hover:bg-red-600/80"
          aria-label="Delete photo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </figcaption>
    </figure>
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

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        await addPhoto(jobId, file);
      }
      refreshSitefold();
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this photo?")) return;
    await deletePhoto(id);
    refreshSitefold();
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
              onDelete={() => onDelete(photo.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
