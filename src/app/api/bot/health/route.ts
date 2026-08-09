import { NextResponse } from "next/server";
import { requireBotAuthorization } from "@/lib/bot-auth";
import { getProducts, getTestimonials } from "@/lib/catalog";
import { getRepositoryConfig } from "@/lib/github-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireBotAuthorization(request);
    const repository = getRepositoryConfig();
    const [products, testimonials] = await Promise.all([
      getProducts({ includeInactive: true, strict: true }),
      getTestimonials({ strict: true }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        service: "QEVANORA OFFICIAL Bot API",
        storage: "GitHub Contents API",
        repository: `${repository.owner}/${repository.repo}`,
        branch: repository.branch,
        counts: {
          products: products.length,
          testimonials: testimonials.length,
        },
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message === "BOT_UNAUTHORIZED";

    return NextResponse.json(
      {
        ok: false,
        error:
          unauthorized
            ? "API secret bot tidak valid."
            : error instanceof Error
              ? error.message
              : "Pemeriksaan integrasi gagal.",
      },
      {
        status: unauthorized ? 401 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
