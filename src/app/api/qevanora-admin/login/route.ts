import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminLoginRateKey,
  createAdminSessionToken,
  getAdminLoginRateStatus,
  recordAdminLoginAttempt,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginUrl(
  request: Request,
  error?: string,
  retryAfterSeconds?: number,
): URL {
  const url = new URL("/admin", request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  if (retryAfterSeconds && retryAfterSeconds > 0) {
    url.searchParams.set(
      "retry",
      String(Math.max(1, Math.ceil(retryAfterSeconds / 60))),
    );
  }

  return url;
}

function redirectNoStore(url: URL, retryAfterSeconds = 0) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }
  return response;
}

export async function POST(request: Request) {
  let rateKey = "";

  try {
    rateKey = createAdminLoginRateKey(request);
    const rateStatus = await getAdminLoginRateStatus(rateKey);

    if (!rateStatus.allowed) {
      return redirectNoStore(
        loginUrl(request, "rate", rateStatus.retryAfterSeconds),
        rateStatus.retryAfterSeconds,
      );
    }
  } catch {
    return redirectNoStore(loginUrl(request, "config"));
  }

  let password = "";
  try {
    const formData = await request.formData();
    password = String(formData.get("password") || "");
  } catch {
    return redirectNoStore(loginUrl(request, "invalid"));
  }

  let passwordValid = false;
  try {
    passwordValid = await verifyAdminPassword(password);
  } catch {
    return redirectNoStore(loginUrl(request, "config"));
  }

  if (!passwordValid) {
    let rateStatus;
    try {
      rateStatus = await recordAdminLoginAttempt(rateKey, false);
    } catch {
      return redirectNoStore(loginUrl(request, "config"));
    }

    await new Promise((resolve) => setTimeout(resolve, 700));

    if (!rateStatus.allowed) {
      return redirectNoStore(
        loginUrl(request, "rate", rateStatus.retryAfterSeconds),
        rateStatus.retryAfterSeconds,
      );
    }

    return redirectNoStore(loginUrl(request, "invalid"));
  }

  try {
    await recordAdminLoginAttempt(rateKey, true);

    const response = redirectNoStore(new URL("/admin/panel", request.url));
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: createAdminSessionToken(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });

    return response;
  } catch {
    return redirectNoStore(loginUrl(request, "config"));
  }
}
