import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readRepositoryFile } from "@/lib/github-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MEDIA_PATH = /^storage\/(products|testimonials)\/[A-Za-z0-9._-]+$/;
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function readLocalMedia(path: string): Promise<Buffer | null> {
  const storageRoot = resolve(process.cwd(), "storage");
  const relativePath = path.slice("storage/".length);
  const absolutePath = resolve(storageRoot, relativePath);

  if (!absolutePath.startsWith(`${storageRoot}${sep}`)) {
    return null;
  }

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const path = String(request.nextUrl.searchParams.get("path") || "").trim();

    if (!ALLOWED_MEDIA_PATH.test(path)) {
      return NextResponse.json(
        { ok: false, error: "Path media tidak valid." },
        { status: 400 },
      );
    }

    let bytes = await readLocalMedia(path);
    let etag = "";

    if (!bytes) {
      const repositoryFile = await readRepositoryFile(path);
      bytes = repositoryFile?.bytes || null;
      etag = repositoryFile?.sha || "";
    }

    if (!bytes || bytes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Media tidak ditemukan." },
        { status: 404 },
      );
    }

    const extension = path.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control":
          "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
        "Content-Disposition": `inline; filename="${path.split("/").pop() || "media"}"`,
        "X-Content-Type-Options": "nosniff",
        ...(etag ? { ETag: `"${etag}"` } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Media gagal dibaca.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
