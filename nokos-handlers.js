import {
  NokosApiError,
  friendlyNokosError,
  makeCallbackToken,
  makeIdempotencyKey,
  normalizeCountryId,
  normalizeServer,
  normalizeServiceCode,
  resellerSellPrice,
  ensureResellerUser,
} from "./nokos.js";

const PAGE_SIZE = 8;
const SESSION_TTL_MS = 10 * 60 * 1000;
const OTP_POLL_INTERVAL_MS = 5000;
const OTP_POLL_MAX_MS = 2 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  const n = Number(value);
  return `Rp ${Number.isFinite(n) ? Math.round(n).toLocaleString("id-ID") : "0"}`;
}

function userIdOf(ctx) {
  const id = String(ctx?.from?.id ?? ctx?.callbackQuery?.from?.id ?? "").trim();
  return /^\d{1,20}$/.test(id) ? id : null;
}

function chatIdOf(ctx) {
  const value = ctx?.chat?.id ?? ctx?.callbackQuery?.message?.chat?.id;
  return value == null ? null : String(value);
}

function isPrivate(ctx) {
  return String(ctx?.chat?.type ?? ctx?.callbackQuery?.message?.chat?.type ?? "") === "private";
}

async function requirePrivate(ctx) {
  if (isPrivate(ctx)) return true;
  try {
    await ctx.answerCbQuery(
      "NOKOS hanya dapat digunakan di private chat untuk melindungi saldo, nomor, dan OTP.",
      { show_alert: true },
    );
  } catch {}
  if (ctx?.message) {
    await ctx.reply("🔒 Gunakan fitur NOKOS melalui private chat.").catch(() => undefined);
  }
  return false;
}

async function answerCallback(ctx, text = undefined) {
  if (!ctx?.callbackQuery) return;
  try {
    await ctx.answerCbQuery(text);
  } catch {}
}

async function editOrReply(ctx, text, extra = {}) {
  if (ctx?.callbackQuery?.message) {
    try {
      return await ctx.editMessageText(text, extra);
    } catch (error) {
      const message = String(error?.description || error?.message || "");
      if (/message is not modified/i.test(message)) return null;
      if (!/message to edit not found|message can't be edited|message_id_invalid/i.test(message)) {
        // Fall through to a new message for resilience, but do not hide the error.
      }
    }
  }
  return ctx.reply(text, extra);
}

function inlineKeyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

function parsePage(raw) {
  const page = Number.parseInt(String(raw ?? "0"), 10);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

function trimButton(text, max = 52) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function countryLabel(country) {
  if (Number(country?.id) === 6) return "🇮🇩 Indonesia";
  return country?.name || `Country ${country?.id}`;
}

function serviceLabel(service) {
  if (service === "wa") return "WhatsApp";
  if (service === "tg") return "Telegram";
  return String(service || "").toUpperCase();
}

function classifyOrderFailure(error) {
  if (!(error instanceof NokosApiError)) {
    const text = String(error?.message || error || "");
    if (/timeout|network|ECONN|EAI_AGAIN|ENOTFOUND/i.test(text)) return "ambiguous";
    return "definitive";
  }
  if (error.transient || error.status === 429) return "ambiguous";
  if ([400, 401, 403, 404, 405, 409, 413, 415, 422].includes(Number(error.status))) {
    return "definitive";
  }
  return error.status == null ? "ambiguous" : "definitive";
}

export function registerNokosHandlers(bot, options = {}) {
  if (!bot || typeof bot.command !== "function" || typeof bot.action !== "function") {
    throw new TypeError("registerNokosHandlers membutuhkan instance Telegraf/Telekaf.");
  }
  const client = options.client;
  const store = options.store;
  if (!client || !store) throw new TypeError("client dan store NOKOS wajib diberikan.");

  const ownerIds = new Set((options.ownerIds || []).map((x) => String(x)));
  const logger = options.logger || console;
  const sessions = new Map();
  const orderLocks = new Set();
  const depositLocks = new Set();
  const pollers = new Map();

  const logError = (scope, error, context = {}) => {
    try {
      logger.error?.({
        scope,
        message: String(error?.message || error),
        status: error?.status ?? null,
        action: error?.action ?? null,
        ...context,
      });
    } catch {
      console.error(`[${scope}]`, error);
    }
  };

  const isOwner = (ctx) => ownerIds.has(String(userIdOf(ctx) || ""));

  function sessionKey(ctx) {
    return `${chatIdOf(ctx) || "0"}:${userIdOf(ctx) || "0"}`;
  }

  function setSession(ctx, data) {
    sessions.set(sessionKey(ctx), { ...data, createdAt: Date.now() });
  }

  function getSession(ctx) {
    const key = sessionKey(ctx);
    const value = sessions.get(key);
    if (!value) return null;
    if (Date.now() - value.createdAt > SESSION_TTL_MS) {
      sessions.delete(key);
      return null;
    }
    return value;
  }

  function clearSession(ctx) {
    sessions.delete(sessionKey(ctx));
  }

  async function showError(ctx, error) {
    logError("NOKOS_HANDLER", error, { userId: userIdOf(ctx) });
    await answerCallback(ctx);
    const text = `❌ <b>NOKOS Error</b>\n\n${escapeHtml(friendlyNokosError(error))}`;
    return editOrReply(ctx, text, {
      parse_mode: "HTML",
      ...inlineKeyboard([[{ text: "⬅️ Kembali", callback_data: "nokos:home" }]]),
    });
  }

  async function showHome(ctx) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx);
    const userId = userIdOf(ctx);
    if (!userId) return showError(ctx, new Error("Telegram user ID tidak tersedia."));
    const wallet = await store.wallet(userId);
    const rows = [
      [
        { text: "WhatsApp", callback_data: "nokos:countries:wa:0" },
        { text: "Telegram", callback_data: "nokos:countries:tg:0" },
      ],
      [{ text: "📚 Semua layanan", callback_data: "nokos:services:0" }],
      [
        { text: "💰 Saldo", callback_data: "nokos:balance" },
        { text: "💳 Deposit QRIS", callback_data: "nokos:deposit" },
      ],
      [{ text: "🧾 Pesanan saya", callback_data: "nokos:orders" }],
    ];
    if (isOwner(ctx)) {
      rows.push([{ text: "🏦 Saldo provider", callback_data: "nokos:provider_balance" }]);
    }
    return editOrReply(
      ctx,
      [
        "<b>Qevanora NOKOS</b>",
        "",
        `Saldo kamu: <b>${money(wallet.balance)}</b>`,
        `Markup tetap: <b>${money(wallet.markupFixed)}</b>`,
        "",
        "Pilih layanan untuk melihat harga dan stok live.",
      ].join("\n"),
      { parse_mode: "HTML", ...inlineKeyboard(rows) },
    );
  }

  async function showWallet(ctx) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx);
    const wallet = await store.wallet(userIdOf(ctx));
    return editOrReply(
      ctx,
      [
        "<b>Saldo NOKOS Reseller</b>",
        "",
        `Saldo: <b>${money(wallet.balance)}</b>`,
        `Total deposit: ${money(wallet.totalDeposited)}`,
        `Total belanja: ${money(wallet.totalSpent)}`,
      ].join("\n"),
      {
        parse_mode: "HTML",
        ...inlineKeyboard([
          [{ text: "💳 Deposit", callback_data: "nokos:deposit" }],
          [{ text: "⬅️ Kembali", callback_data: "nokos:home" }],
        ]),
      },
    );
  }

  async function showProviderBalance(ctx) {
    if (!(await requirePrivate(ctx))) return;
    if (!isOwner(ctx)) {
      await answerCallback(ctx, "Owner only.");
      return;
    }
    await answerCallback(ctx, "Memuat saldo provider...");
    try {
      const data = await client.getBalance();
      return editOrReply(ctx, `<b>Saldo Provider NOKOS</b>\n\n${money(data.balance)}`, {
        parse_mode: "HTML",
        ...inlineKeyboard([[{ text: "⬅️ Kembali", callback_data: "nokos:home" }]]),
      });
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function showServices(ctx, page = 0) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx, "Memuat layanan...");
    page = parsePage(page);
    try {
      const services = await client.listServices();
      if (!services.length) throw new Error("Daftar layanan NOKOS kosong.");
      const pages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
      page = Math.min(page, pages - 1);
      const slice = services.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      const rows = slice.map((item) => [
        {
          text: trimButton(`${item.name} (${item.code})`),
          callback_data: `nokos:countries:${item.code}:0`,
        },
      ]);
      const nav = [];
      if (page > 0) nav.push({ text: "◀️", callback_data: `nokos:services:${page - 1}` });
      nav.push({ text: `${page + 1}/${pages}`, callback_data: "nokos:noop" });
      if (page + 1 < pages) nav.push({ text: "▶️", callback_data: `nokos:services:${page + 1}` });
      rows.push(nav);
      rows.push([{ text: "⬅️ Kembali", callback_data: "nokos:home" }]);
      return editOrReply(
        ctx,
        `<b>Semua Layanan NOKOS</b>\n\nPilih layanan. Halaman ${page + 1}/${pages}.`,
        { parse_mode: "HTML", ...inlineKeyboard(rows) },
      );
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function serviceCatalog(service, { force = false } = {}) {
    const code = normalizeServiceCode(service);
    const [s2Result, s1Result] = await Promise.allSettled([
      client.getPrices({ service: code, server: "s2", force }),
      client.getPrices({ service: code, server: "s1", force }),
    ]);
    if (s2Result.status === "rejected" && s1Result.status === "rejected") {
      throw new Error(
        `Harga/stok S2: ${friendlyNokosError(s2Result.reason)} | S1: ${friendlyNokosError(s1Result.reason)}`,
      );
    }
    const s2 = s2Result.status === "fulfilled" ? s2Result.value : {};
    const s1 = s1Result.status === "fulfilled" ? s1Result.value : {};
    return { code, s2, s1 };
  }

  async function countryNameMap() {
    try {
      const countries = await client.getCountries();
      return new Map(countries.map((country) => [Number(country.id), country]));
    } catch {
      return new Map([[6, { id: 6, name: "Indonesia", prefix: "+62" }]]);
    }
  }

  async function showCountries(ctx, service, page = 0, force = false) {
    if (!(await requirePrivate(ctx))) return;
    const code = normalizeServiceCode(service);
    page = parsePage(page);
    await answerCallback(ctx, force ? "Refresh harga/stok..." : "Memuat harga/stok...");
    try {
      const [catalog, names, settings] = await Promise.all([
        serviceCatalog(code, { force }),
        countryNameMap(),
        store.settings(),
      ]);
      const ids = new Set([...Object.keys(catalog.s2), ...Object.keys(catalog.s1)]);
      const entries = [...ids]
        .map((raw) => normalizeCountryId(raw))
        .map((id) => {
          const p2 = catalog.s2?.[String(id)]?.[code] || null;
          const p1 = catalog.s1?.[String(id)]?.[code] || null;
          const valid = [p2, p1].filter(
            (item) => Number.isFinite(Number(item?.cost)) && Number.isFinite(Number(item?.count)),
          );
          const cheapest = valid.length
            ? Math.min(...valid.map((item) => Number(item.cost)))
            : null;
          const stock = valid.reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0);
          return {
            id,
            country: names.get(id) || { id, name: `Country ${id}`, prefix: "" },
            cheapest,
            stock,
          };
        })
        .filter((item) => item.cheapest !== null)
        .sort((a, b) => {
          if (a.id === 6) return -1;
          if (b.id === 6) return 1;
          return String(a.country.name).localeCompare(String(b.country.name));
        });

      if (!entries.length) throw new Error(`Harga/stok ${code} tidak tersedia di S1 maupun S2.`);
      const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
      page = Math.min(page, pages - 1);
      const slice = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      const rows = slice.map((item) => [
        {
          text: trimButton(
            `${countryLabel(item.country)} • ${money(resellerSellPrice(item.cheapest, settings))} • ${Math.round(item.stock)} stok`,
          ),
          callback_data: `nokos:country:${code}:${item.id}`,
        },
      ]);
      const nav = [];
      if (page > 0) nav.push({ text: "◀️", callback_data: `nokos:countries:${code}:${page - 1}` });
      nav.push({ text: `${page + 1}/${pages}`, callback_data: "nokos:noop" });
      if (page + 1 < pages) nav.push({ text: "▶️", callback_data: `nokos:countries:${code}:${page + 1}` });
      rows.push(nav);
      rows.push([
        { text: "🔄 Refresh", callback_data: `nokos:countries_refresh:${code}:${page}` },
        { text: "⬅️ Layanan", callback_data: "nokos:services:0" },
      ]);
      return editOrReply(
        ctx,
        [
          `<b>${escapeHtml(serviceLabel(code))}</b>`,
          "",
          "Harga yang tampil sudah termasuk markup reseller.",
          "Stok adalah gabungan S1 + S2; pilih negara untuk melihat masing-masing server.",
        ].join("\n"),
        { parse_mode: "HTML", ...inlineKeyboard(rows) },
      );
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function showCountry(ctx, service, country, force = false) {
    if (!(await requirePrivate(ctx))) return;
    const code = normalizeServiceCode(service);
    const countryId = normalizeCountryId(country);
    await answerCallback(ctx, force ? "Refresh harga..." : "Memuat detail...");
    try {
      const [s2, s1, names, settings] = await Promise.all([
        client.getPrice({ service: code, country: countryId, server: "s2", force }).catch((error) => ({ error })),
        client.getPrice({ service: code, country: countryId, server: "s1", force }).catch((error) => ({ error })),
        countryNameMap(),
        store.settings(),
      ]);
      const countryData = names.get(countryId) || {
        id: countryId,
        name: countryId === 6 ? "Indonesia" : `Country ${countryId}`,
        prefix: countryId === 6 ? "+62" : "",
      };
      const rows = [];
      const lines = [
        `<b>${escapeHtml(serviceLabel(code))} • ${escapeHtml(countryLabel(countryData))}</b>`,
        "",
      ];

      for (const [server, result, label] of [
        ["s2", s2, "Server Plus"],
        ["s1", s1, "Server Express"],
      ]) {
        if (result?.error) {
          lines.push(`<b>${label}</b>: tidak tersedia (${escapeHtml(friendlyNokosError(result.error))})`);
          continue;
        }
        const salePrice = resellerSellPrice(result.cost, settings);
        lines.push(
          `<b>${label}</b>: ${money(salePrice)} • stok ${Math.round(Number(result.count) || 0)}`,
        );
        if (Number(result.count) > 0) {
          rows.push([
            {
              text: `Beli ${server.toUpperCase()} • ${money(salePrice)}`,
              callback_data: `nokos:buy:${code}:${countryId}:${server}`,
            },
          ]);
        }
      }
      if (!rows.length) lines.push("\nTidak ada server dengan stok yang dapat dibeli saat ini.");
      rows.push([
        { text: "🔄 Refresh", callback_data: `nokos:country_refresh:${code}:${countryId}` },
        { text: "⬅️ Negara", callback_data: `nokos:countries:${code}:0` },
      ]);
      return editOrReply(ctx, lines.join("\n"), {
        parse_mode: "HTML",
        ...inlineKeyboard(rows),
      });
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function resolveOrderByToken(token) {
    const value = String(token || "");
    return store.read((db) =>
      Object.values(db.orders || {}).find((order) => {
        const activationId = String(order?.activationId || "");
        return String(order?.callbackToken || "") === value || makeCallbackToken(activationId, 16) === value;
      }) || null,
    );
  }

  async function authorizeOrder(ctx, token) {
    const order = await resolveOrderByToken(token);
    if (!order) return { allowed: false, order: null };
    const allowed = isOwner(ctx) || String(order.userId) === String(userIdOf(ctx));
    return { allowed, order };
  }

  async function renderOrder(ctx, order, { duplicate = false } = {}) {
    const token = order.callbackToken || makeCallbackToken(order.activationId, 16);
    const rows = [
      [{ text: "🔄 Cek OTP", callback_data: `nokos:o:${token}:status` }],
      [
        { text: "📨 Kirim ulang", callback_data: `nokos:o:${token}:resend` },
        { text: "✅ Selesai", callback_data: `nokos:o:${token}:finish` },
      ],
      [{ text: "♻️ Cancel", callback_data: `nokos:o:${token}:cancel` }],
      [{ text: "⬅️ Menu", callback_data: "nokos:home" }],
    ];
    return editOrReply(
      ctx,
      [
        "<b>NOKOS Order</b>",
        duplicate ? "<i>Order ini sudah diproses sebelumnya; tidak ada potongan saldo kedua.</i>" : "",
        "",
        `Nomor: <code>+${escapeHtml(String(order.phone || "").replace(/^\+/, ""))}</code>`,
        `Activation ID: <code>${escapeHtml(order.activationId)}</code>`,
        `Layanan: ${escapeHtml(serviceLabel(order.service))}`,
        `Country: ${escapeHtml(order.country)}`,
        `Server: ${escapeHtml(String(order.server).toUpperCase())}`,
        `Harga: <b>${money(order.salePrice)}</b>`,
        `Status: ${escapeHtml(order.status || "waiting")}`,
        `Expired: ${escapeHtml(order.expiresAt || "-")}`,
      ].filter(Boolean).join("\n"),
      { parse_mode: "HTML", ...inlineKeyboard(rows) },
    );
  }

  function startOtpPolling(order) {
    const activationId = String(order.activationId);
    if (!activationId || pollers.has(activationId)) return;
    const state = { stopped: false, startedAt: Date.now() };
    pollers.set(activationId, state);

    const run = async () => {
      try {
        while (!state.stopped && Date.now() - state.startedAt < OTP_POLL_MAX_MS) {
          await new Promise((resolve) => setTimeout(resolve, OTP_POLL_INTERVAL_MS));
          const current = await store.order(activationId);
          if (!current || ["finished", "cancelled"].includes(String(current.status))) break;

          let status;
          try {
            status = await client.getStatus(activationId);
          } catch (error) {
            logError("NOKOS_OTP_POLL", error, { activationId });
            if (error instanceof NokosApiError && !error.transient) break;
            continue;
          }

          const normalizedStatus = status.status === "STATUS_OK" ? "received" : status.status || "waiting";
          await store.mutate((db) => {
            const item = db.orders[activationId];
            if (!item) return;
            item.status = normalizedStatus;
            item.updatedAt = new Date().toISOString();
          });

          if (status.status === "STATUS_OK" && status.code) {
            const token = current.callbackToken || makeCallbackToken(activationId, 16);
            await bot.telegram.sendMessage(
              current.chatId,
              [
                "✅ <b>OTP NOKOS masuk</b>",
                "",
                `Nomor: <code>+${escapeHtml(current.phone)}</code>`,
                `OTP: <code>${escapeHtml(status.code)}</code>`,
                status.sms ? `SMS: ${escapeHtml(status.sms)}` : "",
              ].filter(Boolean).join("\n"),
              {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "📨 Kirim ulang", callback_data: `nokos:o:${token}:resend` },
                      { text: "✅ Selesai", callback_data: `nokos:o:${token}:finish` },
                    ],
                  ],
                },
              },
            ).catch((error) => logError("NOKOS_OTP_SEND", error, { activationId }));
            break;
          }
        }
      } finally {
        pollers.delete(activationId);
      }
    };
    run().catch((error) => {
      pollers.delete(activationId);
      logError("NOKOS_OTP_POLL_FATAL", error, { activationId });
    });
  }

  async function buyNumber(ctx, service, country, server) {
    if (!(await requirePrivate(ctx))) return;
    const code = normalizeServiceCode(service);
    const countryId = normalizeCountryId(country);
    const normalizedServer = normalizeServer(server);
    const userId = userIdOf(ctx);
    const chatId = chatIdOf(ctx);
    if (!userId || !chatId) return showError(ctx, new Error("User/chat ID tidak tersedia."));
    if (orderLocks.has(userId)) {
      await answerCallback(ctx, "Order kamu masih diproses.");
      return;
    }
    orderLocks.add(userId);
    let reserved = false;
    let idempotencyKey = null;
    let salePrice = null;

    try {
      await answerCallback(ctx, "Validasi harga, stok, dan saldo...");

      // Build/check idempotency before touching the provider or wallet. A repeated
      // callback must never cause a second fresh quote followed by a second debit.
      const sourceMessageId = ctx?.callbackQuery?.message?.message_id || 0;
      idempotencyKey = makeIdempotencyKey("order", [
        userId,
        chatId,
        sourceMessageId,
        code,
        countryId,
        normalizedServer,
      ]);

      const previous = await store.read((db) => db.purchaseAttempts[idempotencyKey] || null);
      if (previous?.status === "completed" && previous.activationId) {
        const order = await store.order(previous.activationId);
        if (order) return renderOrder(ctx, order, { duplicate: true });
      }
      if (previous && ["pending", "review"].includes(String(previous.status))) {
        throw new Error("Order sebelumnya masih dalam pengecekan; saldo tidak dipotong lagi.");
      }

      // TAHAP 2: hard-refresh exact service + country + server immediately before
      // reserving local balance. force:true bypasses the price cache in NokosClient.
      const quoted = await client.getPrice({
        service: code,
        country: countryId,
        server: normalizedServer,
        force: true,
      });
      const freshProviderPrice = Number(quoted.cost);
      const freshProviderStock = Number(quoted.count);
      const quoteCheckedAt = new Date().toISOString();

      if (!Number.isFinite(freshProviderPrice) || freshProviderPrice < 0) {
        throw new Error("Harga provider NOKOS tidak valid; saldo tidak dipotong.");
      }
      if (!Number.isFinite(freshProviderStock) || freshProviderStock <= 0) {
        throw new Error("Stok nomor sedang kosong; saldo tidak dipotong.");
      }

      // The debit and purchase-attempt record stay in one serialized store mutation.
      // Markup is also read from this same DB snapshot so the charged price is the
      // current selling price at the exact point the balance is reserved.
      const reservation = await store.mutate((db) => {
        const prior = db.purchaseAttempts[idempotencyKey];
        if (prior?.status === "completed") {
          return { duplicate: true, activationId: prior.activationId || null };
        }
        if (prior && ["pending", "review"].includes(String(prior.status))) {
          throw new Error("ORDER_ALREADY_PENDING");
        }

        const freshSalePrice = resellerSellPrice(freshProviderPrice, db.settings || {});
        if (!Number.isFinite(freshSalePrice) || freshSalePrice < 0) {
          throw new Error("Harga jual NOKOS tidak valid; saldo tidak dipotong.");
        }

        const user = ensureResellerUser(db, userId);
        if (user.balance < freshSalePrice) {
          const error = new Error(
            `Saldo tidak cukup. Dibutuhkan ${money(freshSalePrice)}, saldo kamu ${money(user.balance)}.`,
          );
          error.code = "LOCAL_WALLET_INSUFFICIENT";
          throw error;
        }

        user.balance -= freshSalePrice;
        user.updatedAt = new Date().toISOString();
        const now = new Date().toISOString();
        db.purchaseAttempts[idempotencyKey] = {
          idempotencyKey,
          userId,
          chatId,
          service: code,
          country: countryId,
          server: normalizedServer,
          quotedProviderPrice: Math.round(freshProviderPrice),
          quotedProviderStock: Math.floor(freshProviderStock),
          quoteCheckedAt,
          salePrice: freshSalePrice,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        return { duplicate: false, salePrice: freshSalePrice, balance: user.balance };
      });

      if (reservation?.duplicate && reservation.activationId) {
        const order = await store.order(reservation.activationId);
        if (order) return renderOrder(ctx, order, { duplicate: true });
      }
      salePrice = Number(reservation?.salePrice);
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        throw new Error("Reservasi saldo NOKOS menghasilkan harga tidak valid.");
      }
      reserved = true;

      const data = await client.getNumber({
        service: code,
        country: countryId,
        server: normalizedServer,
        operator: "any",
        idempotencyKey,
      });

      const activationId = String(data.activation_id);
      const actualProviderPrice = Number(data.price);
      const now = new Date().toISOString();
      const order = {
        activationId,
        callbackToken: makeCallbackToken(activationId, 16),
        userId,
        chatId,
        service: code,
        country: countryId,
        server: normalizedServer,
        phone: data.phone,
        providerPrice: Number.isFinite(actualProviderPrice) ? Math.round(actualProviderPrice) : null,
        salePrice,
        markupAmount: Number.isFinite(actualProviderPrice)
          ? salePrice - Math.round(actualProviderPrice)
          : null,
        status: "waiting",
        expiresAt: String(data.expires_at || ""),
        createdAt: now,
        updatedAt: now,
        idempotencyKey,
      };

      await store.mutate((db) => {
        const attempt = db.purchaseAttempts[idempotencyKey];
        if (!attempt) throw new Error("Purchase attempt lokal tidak ditemukan saat finalisasi.");
        attempt.status = "completed";
        attempt.activationId = activationId;
        attempt.updatedAt = now;
        db.orders[activationId] = order;
        const user = ensureResellerUser(db, userId);
        user.totalSpent += salePrice;
        user.updatedAt = now;
      });
      reserved = false;

      if (Number.isFinite(actualProviderPrice) && actualProviderPrice > salePrice) {
        logError("NOKOS_PRICE_DRIFT", new Error("Provider price exceeded charged sale price"), {
          activationId,
          providerPrice: actualProviderPrice,
          salePrice,
        });
      }

      startOtpPolling(order);
      return renderOrder(ctx, order);
    } catch (error) {
      if (reserved && idempotencyKey) {
        const type = classifyOrderFailure(error);
        if (type === "definitive") {
          await store.mutate((db) => {
            const attempt = db.purchaseAttempts[idempotencyKey];
            if (!attempt || attempt.status !== "pending") return;
            const user = ensureResellerUser(db, String(attempt.userId));
            user.balance += Math.round(Number(attempt.salePrice) || 0);
            user.updatedAt = new Date().toISOString();
            attempt.status = "failed_refunded";
            attempt.error = friendlyNokosError(error);
            attempt.updatedAt = new Date().toISOString();
          }).catch((refundError) => logError("NOKOS_ORDER_REFUND", refundError, { idempotencyKey }));
        } else {
          await store.mutate((db) => {
            const attempt = db.purchaseAttempts[idempotencyKey];
            if (attempt?.status === "pending") {
              attempt.status = "review";
              attempt.error = friendlyNokosError(error);
              attempt.updatedAt = new Date().toISOString();
            }
          }).catch((markError) => logError("NOKOS_ORDER_REVIEW", markError, { idempotencyKey }));
          logError("NOKOS_ORDER_AMBIGUOUS", error, { idempotencyKey, userId, salePrice });
          return editOrReply(
            ctx,
            "⚠️ <b>Order perlu dicek</b>\n\nProvider gagal memberikan hasil final setelah saldo direservasi. Saldo tidak dikembalikan otomatis karena nomor mungkin sudah terbeli. Jangan order ulang; minta owner merekonsiliasi purchaseAttempts.",
            {
              parse_mode: "HTML",
              ...inlineKeyboard([[{ text: "⬅️ Menu", callback_data: "nokos:home" }]]),
            },
          );
        }
      }
      return showError(ctx, error);
    } finally {
      orderLocks.delete(userId);
    }
  }

  async function showOrderStatus(ctx, token) {
    if (!(await requirePrivate(ctx))) return;
    const auth = await authorizeOrder(ctx, token);
    if (!auth.allowed) {
      await answerCallback(ctx, "Pesanan ini bukan milik akun kamu.");
      return;
    }
    await answerCallback(ctx, "Cek OTP...");
    try {
      const data = await client.getStatus(auth.order.activationId);
      await store.mutate((db) => {
        const order = db.orders[String(auth.order.activationId)];
        if (!order) return;
        order.status = data.status === "STATUS_OK" ? "received" : data.status || "waiting";
        order.updatedAt = new Date().toISOString();
      });
      const rows = [
        [
          { text: "🔄 Cek lagi", callback_data: `nokos:o:${token}:status` },
          { text: "📨 Kirim ulang", callback_data: `nokos:o:${token}:resend` },
        ],
        [
          { text: "✅ Selesai", callback_data: `nokos:o:${token}:finish` },
          { text: "♻️ Cancel", callback_data: `nokos:o:${token}:cancel` },
        ],
        [{ text: "⬅️ Pesanan", callback_data: "nokos:orders" }],
      ];
      return editOrReply(
        ctx,
        [
          "<b>Status OTP NOKOS</b>",
          "",
          `Nomor: <code>+${escapeHtml(auth.order.phone)}</code>`,
          `Status: ${escapeHtml(data.status)}`,
          `OTP: <code>${escapeHtml(data.code || "Belum masuk")}</code>`,
          data.sms ? `SMS: ${escapeHtml(data.sms)}` : "",
        ].filter(Boolean).join("\n"),
        { parse_mode: "HTML", ...inlineKeyboard(rows) },
      );
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function updateActivation(ctx, token, mode) {
    if (!(await requirePrivate(ctx))) return;
    const auth = await authorizeOrder(ctx, token);
    if (!auth.allowed) {
      await answerCallback(ctx, "Pesanan ini bukan milik akun kamu.");
      return;
    }
    const activationId = String(auth.order.activationId);
    try {
      if (mode === "finish") {
        await answerCallback(ctx, "Menyelesaikan aktivasi...");
        await client.setStatus(activationId, 6);
        await store.mutate((db) => {
          const order = db.orders[activationId];
          if (order) {
            order.status = "finished";
            order.updatedAt = new Date().toISOString();
          }
        });
        pollers.get(activationId) && (pollers.get(activationId).stopped = true);
        return editOrReply(ctx, "✅ Aktivasi NOKOS diselesaikan.", {
          ...inlineKeyboard([[{ text: "⬅️ Menu", callback_data: "nokos:home" }]]),
        });
      }

      if (mode === "resend") {
        await answerCallback(ctx, "Meminta SMS berikutnya...");
        await client.setStatus(activationId, 3);
        startOtpPolling(auth.order);
        return editOrReply(ctx, "📨 Permintaan SMS berikutnya dikirim ke NOKOS.", {
          ...inlineKeyboard([
            [{ text: "🔄 Cek OTP", callback_data: `nokos:o:${token}:status` }],
            [{ text: "⬅️ Pesanan", callback_data: "nokos:orders" }],
          ]),
        });
      }

      if (mode === "cancel") {
        await answerCallback(ctx, "Memeriksa status sebelum cancel...");
        const currentStatus = await client.getStatus(activationId);
        if (currentStatus.status === "STATUS_OK" || currentStatus.code) {
          return editOrReply(
            ctx,
            "❌ OTP sudah diterima. Bot tidak melakukan refund lokal otomatis untuk order yang sudah menerima OTP.",
            {
              ...inlineKeyboard([[{ text: "⬅️ Pesanan", callback_data: "nokos:orders" }]]),
            },
          );
        }

        await client.cancelActivation(activationId);
        const result = await store.mutate((db) => {
          const order = db.orders[activationId];
          if (!order) throw new Error("Order lokal tidak ditemukan.");
          let refunded = false;
          if (!order.refunded) {
            const user = ensureResellerUser(db, String(order.userId));
            const amount = Math.round(Number(order.salePrice) || 0);
            user.balance += amount;
            user.totalSpent = Math.max(0, user.totalSpent - amount);
            user.updatedAt = new Date().toISOString();
            order.refunded = true;
            order.refundedAmount = amount;
            order.refundedAt = new Date().toISOString();
            refunded = true;
          }
          order.status = "cancelled";
          order.updatedAt = new Date().toISOString();
          return { refunded, amount: Number(order.refundedAmount || 0) };
        });
        pollers.get(activationId) && (pollers.get(activationId).stopped = true);
        return editOrReply(
          ctx,
          `♻️ Aktivasi dibatalkan.${result.refunded ? `\nSaldo lokal dikembalikan ${money(result.amount)}.` : ""}`,
          { ...inlineKeyboard([[{ text: "⬅️ Menu", callback_data: "nokos:home" }]]) },
        );
      }
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function showOrders(ctx) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx, "Memuat pesanan...");
    try {
      const orders = await store.ordersForUser(userIdOf(ctx), 10);
      if (!orders.length) {
        return editOrReply(ctx, "<b>Pesanan NOKOS</b>\n\nBelum ada pesanan.", {
          parse_mode: "HTML",
          ...inlineKeyboard([[{ text: "⬅️ Menu", callback_data: "nokos:home" }]]),
        });
      }
      const rows = orders.map((order) => {
        const token = order.callbackToken || makeCallbackToken(order.activationId, 16);
        return [
          {
            text: trimButton(`${serviceLabel(order.service)} • +${order.phone} • ${order.status || "waiting"}`),
            callback_data: `nokos:o:${token}:status`,
          },
        ];
      });
      rows.push([{ text: "⬅️ Menu", callback_data: "nokos:home" }]);
      return editOrReply(ctx, "<b>10 Pesanan NOKOS Terakhir</b>\n\nPilih transaksi untuk cek OTP/status.", {
        parse_mode: "HTML",
        ...inlineKeyboard(rows),
      });
    } catch (error) {
      return showError(ctx, error);
    }
  }

  async function beginDeposit(ctx) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx);
    setSession(ctx, { stage: "deposit_amount" });
    return editOrReply(
      ctx,
      "<b>Deposit NOKOS QRIS</b>\n\nKirim nominal antara Rp10.000 sampai Rp10.000.000.\nContoh: <code>50000</code>",
      {
        parse_mode: "HTML",
        ...inlineKeyboard([[{ text: "❌ Batal", callback_data: "nokos:home" }]]),
      },
    );
  }

  async function createDepositFromMessage(ctx, amount) {
    const userId = userIdOf(ctx);
    const chatId = chatIdOf(ctx);
    if (!userId || !chatId) return showError(ctx, new Error("User/chat ID tidak tersedia."));
    if (depositLocks.has(userId)) {
      await ctx.reply("⏳ Deposit kamu sedang diproses. Jangan kirim nominal dua kali.");
      return;
    }
    depositLocks.add(userId);
    setSession(ctx, { stage: "deposit_processing" });
    try {
      const idempotencyKey = makeIdempotencyKey("deposit", [
        userId,
        chatId,
        ctx?.message?.message_id || 0,
        amount,
      ]);
      const data = await client.createDeposit(amount, { idempotencyKey });
      const transactionId = data.transaction_id;
      const callbackToken = makeCallbackToken(transactionId, 20);
      await store.mutate((db) => {
        ensureResellerUser(db, userId);
        const existing = db.deposits[transactionId];
        if (existing && String(existing.userId) !== userId) {
          throw new Error("Deposit transaction ID collision.");
        }
        const now = new Date().toISOString();
        db.deposits[transactionId] = {
          ...(existing || {}),
          transactionId,
          callbackToken: existing?.callbackToken || callbackToken,
          userId,
          requestedAmount: Math.round(amount),
          payAmount: Math.round(data.pay_amount),
          providerAmount: data.amount == null ? null : Math.round(data.amount),
          status: existing?.status || "pending",
          credited: Boolean(existing?.credited),
          qrisUrl: data.qris_url,
          expiresAt: data.expires_at || existing?.expiresAt || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
      });
      clearSession(ctx);
      const caption = [
        "Qevanora NOKOS • Deposit QRIS",
        "",
        `Bayar: ${money(data.pay_amount)}`,
        `Transaction ID: ${transactionId}`,
        `Expired: ${data.expires_at || "-"}`,
        "",
        "Setelah membayar, tekan CEK PEMBAYARAN.",
      ].join("\n");
      const markup = {
        inline_keyboard: [
          [{ text: "✅ Cek pembayaran", callback_data: `nokos:dep:${callbackToken}` }],
          [{ text: "⬅️ Menu", callback_data: "nokos:home" }],
        ],
      };
      try {
        await ctx.replyWithPhoto(data.qris_url, { caption, reply_markup: markup });
      } catch (error) {
        logError("NOKOS_DEPOSIT_QR_SEND", error, { transactionId, userId });
        await ctx.reply(`${caption}\n\nQRIS: ${data.qris_url}`, { reply_markup: markup });
      }
    } catch (error) {
      setSession(ctx, { stage: "deposit_amount" });
      await showError(ctx, error);
    } finally {
      depositLocks.delete(userId);
    }
  }

  async function checkDeposit(ctx, token) {
    if (!(await requirePrivate(ctx))) return;
    await answerCallback(ctx, "Mengecek pembayaran...");
    try {
      const local = await store.depositBySelector(token);
      if (!local || (!isOwner(ctx) && String(local.userId) !== String(userIdOf(ctx)))) {
        throw new Error("Deposit ini bukan milik akun kamu.");
      }
      const data = await client.checkDeposit(local.transactionId);
      const result = await store.mutate((db) => {
        const deposit = db.deposits[data.transaction_id];
        if (!deposit) throw new Error("Data deposit lokal tidak ditemukan.");
        deposit.status = data.status;
        deposit.updatedAt = new Date().toISOString();
        if (data.paid_at) deposit.paidAt = data.paid_at;
        if (data.expires_at) deposit.expiresAt = data.expires_at;
        let justCredited = false;
        if (data.status === "paid" && !deposit.credited) {
          // Compatibility with the old DB behavior: local user receives what the
          // user paid (pay_amount), while provider bonuses remain provider margin.
          const credit = Math.round(
            Number(data.pay_amount) > 0 ? Number(data.pay_amount) : Number(deposit.payAmount),
          );
          if (!(credit > 0)) throw new Error("Nominal deposit paid tidak valid.");
          const user = ensureResellerUser(db, String(deposit.userId));
          user.balance += credit;
          user.totalDeposited += credit;
          user.updatedAt = new Date().toISOString();
          deposit.credited = true;
          deposit.creditedAmount = credit;
          deposit.creditedAt = new Date().toISOString();
          justCredited = true;
        }
        const user = ensureResellerUser(db, String(deposit.userId));
        return {
          status: deposit.status,
          balance: user.balance,
          creditedAmount: Number(deposit.creditedAmount || 0),
          justCredited,
        };
      });
      return editOrReply(
        ctx,
        [
          "<b>Status Deposit NOKOS</b>",
          "",
          `Transaction: <code>${escapeHtml(data.transaction_id)}</code>`,
          `Status: <b>${escapeHtml(data.status)}</b>`,
          `Saldo lokal: <b>${money(result.balance)}</b>`,
          result.justCredited ? `Saldo ${money(result.creditedAmount)} baru saja dikreditkan satu kali.` : "",
        ].filter(Boolean).join("\n"),
        {
          parse_mode: "HTML",
          ...inlineKeyboard([
            data.status === "pending"
              ? [{ text: "🔄 Cek lagi", callback_data: `nokos:dep:${token}` }]
              : [],
            [{ text: "⬅️ Menu", callback_data: "nokos:home" }],
          ].filter((row) => row.length)),
        },
      );
    } catch (error) {
      return showError(ctx, error);
    }
  }

  // Commands. These are deliberately separate from the existing obfuscated NOKOS
  // callbacks so migration can be tested without changing unrelated bot features.
  bot.command("nokos", showHome);
  bot.command("nokos_balance", showWallet);
  bot.command("nokos_orders", showOrders);
  bot.command("nokos_deposit", async (ctx) => {
    if (!(await requirePrivate(ctx))) return;
    const text = String(ctx?.message?.text || "");
    const raw = text.split(/\s+/).slice(1).join("").replace(/[^0-9]/g, "");
    if (!raw) return beginDeposit(ctx);
    const amount = Number.parseInt(raw, 10);
    if (!Number.isInteger(amount) || amount < 10000 || amount > 10000000) {
      return ctx.reply("❌ Nominal harus Rp10.000 sampai Rp10.000.000.");
    }
    return createDepositFromMessage(ctx, amount);
  });

  bot.action("nokos:noop", (ctx) => answerCallback(ctx));
  bot.action("nokos:home", showHome);
  bot.action("nokos:balance", showWallet);
  bot.action("nokos:provider_balance", showProviderBalance);
  bot.action("nokos:deposit", beginDeposit);
  bot.action("nokos:orders", showOrders);
  bot.action(/^nokos:services:(\d+)$/, (ctx) => showServices(ctx, ctx.match[1]));
  bot.action(/^nokos:countries:([a-z0-9_-]{1,32}):(\d+)$/, (ctx) =>
    showCountries(ctx, ctx.match[1], ctx.match[2], false),
  );
  bot.action(/^nokos:countries_refresh:([a-z0-9_-]{1,32}):(\d+)$/, (ctx) =>
    showCountries(ctx, ctx.match[1], ctx.match[2], true),
  );
  bot.action(/^nokos:country:([a-z0-9_-]{1,32}):(\d+)$/, (ctx) =>
    showCountry(ctx, ctx.match[1], ctx.match[2], false),
  );
  bot.action(/^nokos:country_refresh:([a-z0-9_-]{1,32}):(\d+)$/, (ctx) =>
    showCountry(ctx, ctx.match[1], ctx.match[2], true),
  );
  bot.action(/^nokos:buy:([a-z0-9_-]{1,32}):(\d+):(s1|s2)$/, (ctx) =>
    buyNumber(ctx, ctx.match[1], ctx.match[2], ctx.match[3]),
  );
  bot.action(/^nokos:o:([a-f0-9]{16}):(status|resend|finish|cancel)$/, (ctx) => {
    const [, token, action] = ctx.match;
    if (action === "status") return showOrderStatus(ctx, token);
    return updateActivation(ctx, token, action);
  });
  bot.action(/^nokos:dep:([a-f0-9]{20})$/, (ctx) => checkDeposit(ctx, ctx.match[1]));

  // Deposit amount input. Calls next() whenever NOKOS does not own the message,
  // so unrelated existing message handlers continue to work.
  bot.on("text", async (ctx, next) => {
    const session = getSession(ctx);
    if (!session) return typeof next === "function" ? next() : undefined;
    if (session.stage !== "deposit_amount") {
      return typeof next === "function" ? next() : undefined;
    }
    if (!(await requirePrivate(ctx))) return;
    const text = String(ctx?.message?.text || "").trim();
    if (!text) return typeof next === "function" ? next() : undefined;
    if (text.startsWith("/")) {
      clearSession(ctx);
      return typeof next === "function" ? next() : undefined;
    }
    const raw = text.replace(/[^0-9]/g, "");
    const amount = Number.parseInt(raw, 10);
    if (!Number.isInteger(amount) || amount < 10000 || amount > 10000000) {
      await ctx.reply("❌ Nominal harus Rp10.000 sampai Rp10.000.000.");
      return;
    }
    return createDepositFromMessage(ctx, amount);
  });

  return {
    showHome,
    showWallet,
    showServices,
    showCountries,
    showCountry,
    showOrders,
    beginDeposit,
    startOtpPolling,
  };
}
