import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function loginUrl(request: Request, error?: string): URL {
  const url = new URL("/qevanora-control", request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  return url;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");

  if (!verifyAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return NextResponse.redirect(loginUrl(request, "invalid"), 303);
  }

  try {
    const response = NextResponse.redirect(
      new URL("/qevanora-control/panel", request.url),
      303,
    );

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
    return NextResponse.redirect(loginUrl(request, "config"), 303);
  }
}
