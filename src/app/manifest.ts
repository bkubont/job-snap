import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Job Snap",
    short_name: "Job Snap",
    description:
      "Turn phone contacts into job folders. Punch in and out, take photos, write daily notes, and export your time clock.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f2e8",
    theme_color: "#2a4036",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
