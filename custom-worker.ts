// @ts-nocheck
// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-ignore
import handler from "./.open-next/worker.js";

const PURPOSE = "qevanora:nokos-recovery:v1";

async function recoveryToken(secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(PURPOSE));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch: handler.fetch,

  async scheduled(controller, env, ctx) {
    const secret = String(
      env.NOKOS_RECOVERY_SECRET || env.ORDER_SESSION_SECRET || "",
    ).trim();

    if (secret.length < 32) {
      console.error(
        "[nokos] cron recovery dilewati: NOKOS_RECOVERY_SECRET/ORDER_SESSION_SECRET belum valid.",
      );
      return;
    }

    const token = await recoveryToken(secret);
    const request = new Request(
      "https://qevanora.internal/api/internal/nokos-recovery",
      {
        method: "POST",
        headers: {
          "x-qevanora-recovery-token": token,
          "x-qevanora-cron": controller.cron || "scheduled",
        },
      },
    );

    const response = await handler.fetch(request, env, ctx);
    const body = await response.text();

    if (!response.ok) {
      console.error(`[nokos] cron recovery HTTP ${response.status}: ${body.slice(0, 1000)}`);
      return;
    }

    console.log(`[nokos] cron recovery OK: ${body.slice(0, 1000)}`);
  },
};
