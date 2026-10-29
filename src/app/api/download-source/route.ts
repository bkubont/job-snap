import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "job-snap-source.zip");
  try {
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="job-snap-source.zip"',
        "Content-Length": String(data.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Source zip not found on this deploy.", { status: 404 });
  }
}
