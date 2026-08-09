import { NextRequest, NextResponse } from "next/server";
import { getProducts, getTestimonials } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") || "all";

    if (type === "products") {
      return NextResponse.json(
        { ok: true, products: await getProducts() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (type === "testimonials") {
      return NextResponse.json(
        { ok: true, testimonials: await getTestimonials() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const [products, testimonials] = await Promise.all([
      getProducts(),
      getTestimonials(),
    ]);

    return NextResponse.json(
      { ok: true, products, testimonials },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Katalog gagal dibaca.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
