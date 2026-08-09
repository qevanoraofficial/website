import { NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearOrderSessionCookie,
  createOrderOwnerKey,
  createOrderSessionToken,
  readOrderSessionToken,
  setOrderSessionCookie,
} from "@/lib/order-session";
import { upsertMember } from "@/lib/member-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRequest = {
  rotate?: boolean;
  profile?: {
    name?: string;
    telegram?: string;
    whatsapp?: string;
  };
};

export async function GET(request: NextRequest) {
  try {
    const token = readOrderSessionToken(request);

    return NextResponse.json(
      {
        ok: true,
        active: Boolean(token),
        accountId: token
          ? createOrderOwnerKey(token).slice(0, 12)
          : "",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        active: false,
        accountId: "",
        error:
          error instanceof Error
            ? error.message
            : "Sesi akun gagal dibaca.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const body = (await request.json().catch(() => ({}))) as AccountRequest;
    const existingToken = readOrderSessionToken(request);
    const shouldRotate = Boolean(body.rotate) || !existingToken;
    const token = shouldRotate
      ? createOrderSessionToken()
      : existingToken;

    if (!token) {
      throw new Error("Sesi akun gagal dibuat.");
    }

    const ownerKey = createOrderOwnerKey(token);
    let memberTracked = false;

    if (body.profile?.name?.trim() && body.profile?.whatsapp?.trim()) {
      try {
        await upsertMember({
          accountId: ownerKey,
          name: body.profile.name,
          telegram: body.profile.telegram,
          whatsapp: body.profile.whatsapp,
        });
        memberTracked = true;
      } catch {
        // Kegagalan statistik anggota tidak boleh menggagalkan akun pelanggan.
      }
    }

    const response = NextResponse.json({
      ok: true,
      rotated: shouldRotate,
      accountId: ownerKey.slice(0, 12),
      memberTracked,
    });

    setOrderSessionCookie(response, token);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Akun aman gagal dibuat.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    clearOrderSessionCookie(response);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Akun gagal dikeluarkan.",
      },
      { status: 500 }
    );
  }
}
