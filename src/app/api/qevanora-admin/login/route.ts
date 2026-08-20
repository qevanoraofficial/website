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

const MAX_LOGIN_BODY_BYTES = 4_096;

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

function blockedResponse(status: 403 | 413) {
  return new NextResponse(status === 413 ? "Payload Too Large" : "Forbidden", {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function isSameOriginRequest(request: Request): boolean {
  const fetchSite = String(request.headers.get("sec-fetch-site") || "")
    .trim()
    .toLowerCase();

  if (fetchSite === "cross-site") {
    return false;
  }

  const requestUrl = new URL(request.url);
  const origin = String(request.headers.get("origin") || "").trim();
  if (origin) {
    try {
      if (new URL(origin).host !== requestUrl.host) return false;
    } catch {
      return false;
    }
  }

  const referer = String(request.headers.get("referer") || "").trim();
  if (referer) {
    try {
      if (new URL(referer).host !== requestUrl.host) return false;
    } catch {
      return false;
    }
  }

  return true;
}

function hasValidLoginBody(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return false;
  }

  const contentType = String(request.headers.get("content-type") || "")
    .trim()
    .toLowerCase();

  return (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return blockedResponse(403);
  }

  if (!hasValidLoginBody(request)) {
    return blockedResponse(413);
  }

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
