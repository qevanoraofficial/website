import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const NOKOS_API_BASE = "https://nokos.co.id/api/";
export const NOKOS_DEFAULT_SERVER = "s2";
export const NOKOS_DEFAULT_COUNTRY = 6;
export const NOKOS_RESELLER_DB = path.join(
  MODULE_DIR,
  "Database",
  "qevanora_nokos_reseller.json",
);

const READONLY_ALLOWED = new Set([
  "getBalance",
  "getPrices",
  "getStatus",
  "getHistory",
  // Official docs currently describe checkDeposit as safe for readonly keys.
  "checkDeposit",
]);

const WRITE_ACTIONS = new Set([
  "getNumber",
  "setStatus",
  "cancelActivation",
  "createDeposit",
]);

const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function finiteNonNegative(value) {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? n : null;
}

function integerNonNegative(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function normalizeServer(server) {
  return String(server).toLowerCase() === "s1" ? "s1" : "s2";
}

export function normalizeServiceCode(service) {
  const code = String(service ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(code)) {
    throw new TypeError("Service code NOKOS tidak valid.");
  }
  return code;
}

export function normalizeCountryId(country) {
  const id = Number.parseInt(String(country ?? NOKOS_DEFAULT_COUNTRY), 10);
  if (!Number.isInteger(id) || id < 0 || id > 9999) {
    throw new TypeError("Country ID NOKOS tidak valid.");
  }
  return id;
}

function safePreview(value, max = 1200) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...[TRUNCATED]` : text;
}

function parseRetryAfter(value) {
  if (value === undefined || value === null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export class NokosApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "NokosApiError";
    this.action = options.action ?? null;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.responsePreview = options.responsePreview ?? null;
    this.cause = options.cause;
  }

  get rateLimited() {
    return this.status === 429 || /rate limit|too many requests/i.test(this.message);
  }

  get readonlyScope() {
    return this.status === 403 && /read.?only|readonly|scope/i.test(this.message);
  }

  get transient() {
    return TRANSIENT_HTTP.has(Number(this.status)) ||
      /timeout|timed out|aborted|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|network/i.test(
        this.message,
      );
  }
}

class SerialLimiter {
  constructor(minIntervalMs = 0) {
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.lastStartedAt = 0;
    this.queue = Promise.resolve();
  }

  schedule(task) {
    const job = this.queue.then(async () => {
      const wait = Math.max(
        0,
        this.minIntervalMs - (Date.now() - this.lastStartedAt),
      );
      if (wait > 0) await sleep(wait);
      this.lastStartedAt = Date.now();
      return task();
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}

class PromiseCache {
  constructor() {
    this.map = new Map();
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return item.promise;
  }

  set(key, ttlMs, promise) {
    const item = {
      expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
      promise: Promise.resolve(promise),
    };
    this.map.set(key, item);
    item.promise.catch(() => {
      if (this.map.get(key) === item) this.map.delete(key);
    });
    return item.promise;
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

export function normalizeServices(raw) {
  let data = raw;
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "data")) {
    data = data.data;
  }
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "services")) {
    data = data.services;
  }

  let rows = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (isPlainObject(data)) {
    rows = Object.entries(data).map(([code, value]) => {
      if (isPlainObject(value)) return { ...value, code: value.code ?? code };
      return { code, name: value };
    });
  }

  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const code = String(row?.code ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    result.push({
      code,
      name: String(row?.name ?? code).trim() || code.toUpperCase(),
    });
  }
  return result;
}

export function normalizeCountries(raw) {
  let data = raw;
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "data")) {
    data = data.data;
  }
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "countries")) {
    data = data.countries;
  }

  let rows = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (isPlainObject(data)) {
    rows = Object.entries(data).map(([id, value]) => {
      if (isPlainObject(value)) return { ...value, id: value.id ?? id };
      return { id, name: value, prefix: "" };
    });
  }

  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const id = integerNonNegative(row?.id);
    if (id === null || id > 9999 || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name: String(row?.name ?? `Country ${id}`).trim() || `Country ${id}`,
      prefix: String(row?.prefix ?? "").trim(),
    });
  }
  return result;
}

function addPrice(out, country, service, cost, count) {
  const countryId = integerNonNegative(country);
  if (countryId === null || countryId > 9999) return;
  const code = String(service ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(code)) return;
  const parsedCost = finiteNonNegative(cost);
  const parsedCount = finiteNonNegative(count);
  if (parsedCost === null || parsedCount === null) return;
  out[String(countryId)] ??= {};
  out[String(countryId)][code] = {
    cost: parsedCost,
    count: parsedCount,
  };
}

/**
 * Normalizes documented getPrices plus several safe equivalent layouts.
 * It never treats an arbitrary scalar as a price or stock value.
 */
export function normalizePrices(raw, context = {}) {
  const out = {};
  const contextCountry =
    context.country === undefined || context.country === null
      ? null
      : normalizeCountryId(context.country);
  const contextService = context.service
    ? normalizeServiceCode(context.service)
    : null;

  let data = raw;
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "data")) {
    data = data.data;
  }
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "prices")) {
    data = data.prices;
  }

  if (Array.isArray(data)) {
    for (const row of data) {
      if (!isPlainObject(row)) continue;
      addPrice(
        out,
        row.country ?? row.country_id ?? contextCountry,
        row.service ?? row.code ?? contextService,
        row.cost ?? row.price,
        row.count ?? row.available ?? row.stock,
      );
    }
    return out;
  }

  if (!isPlainObject(data)) return out;

  // Direct single entry: { cost, count }
  if (
    contextCountry !== null &&
    contextService &&
    (Object.prototype.hasOwnProperty.call(data, "cost") ||
      Object.prototype.hasOwnProperty.call(data, "price")) &&
    (Object.prototype.hasOwnProperty.call(data, "count") ||
      Object.prototype.hasOwnProperty.call(data, "available") ||
      Object.prototype.hasOwnProperty.call(data, "stock"))
  ) {
    addPrice(
      out,
      contextCountry,
      contextService,
      data.cost ?? data.price,
      data.count ?? data.available ?? data.stock,
    );
    return out;
  }

  for (const [firstKey, firstValue] of Object.entries(data)) {
    if (!isPlainObject(firstValue)) continue;

    const firstAsCountry = integerNonNegative(firstKey);
    if (firstAsCountry !== null) {
      // Official: { "6": { "wa": { cost, count } } }
      if (
        contextService &&
        (Object.prototype.hasOwnProperty.call(firstValue, "cost") ||
          Object.prototype.hasOwnProperty.call(firstValue, "price"))
      ) {
        addPrice(
          out,
          firstAsCountry,
          contextService,
          firstValue.cost ?? firstValue.price,
          firstValue.count ?? firstValue.available ?? firstValue.stock,
        );
        continue;
      }

      for (const [serviceCode, priceData] of Object.entries(firstValue)) {
        if (!isPlainObject(priceData)) continue;
        addPrice(
          out,
          firstAsCountry,
          serviceCode,
          priceData.cost ?? priceData.price,
          priceData.count ?? priceData.available ?? priceData.stock,
        );
      }
      continue;
    }

    // Direct service map when country is already known:
    // { "wa": { cost, count }, "tg": { cost, count } }
    if (contextCountry !== null) {
      addPrice(
        out,
        contextCountry,
        firstKey,
        firstValue.cost ?? firstValue.price,
        firstValue.count ?? firstValue.available ?? firstValue.stock,
      );
    }
  }

  return out;
}

export function priceEntry(prices, country, service) {
  const countryId = normalizeCountryId(country);
  const code = normalizeServiceCode(service);
  const item = prices?.[String(countryId)]?.[code];
  if (!item) return null;
  const cost = finiteNonNegative(item.cost);
  const count = finiteNonNegative(item.count);
  return cost === null || count === null ? null : { cost, count };
}

/**
 * Parses official getAvailability and observed legacy/map-style variants safely.
 * Scalar map values are treated ONLY as availability counts, never as prices.
 */
export function normalizeAvailability(raw, { service, country, server } = {}) {
  const code = normalizeServiceCode(service);
  const countryId = normalizeCountryId(country);
  const normalizedServer = normalizeServer(server);

  let data = raw;
  if (isPlainObject(data) && Object.prototype.hasOwnProperty.call(data, "data")) {
    data = data.data;
  }
  if (
    isPlainObject(data) &&
    Object.prototype.hasOwnProperty.call(data, "availability") &&
    !Object.prototype.hasOwnProperty.call(data, "available")
  ) {
    data = data.availability;
  }

  if (isPlainObject(data)) {
    // Official: { available, price }
    if (
      Object.prototype.hasOwnProperty.call(data, "available") ||
      Object.prototype.hasOwnProperty.call(data, "price")
    ) {
      const available = finiteNonNegative(data.available);
      const price = finiteNonNegative(data.price);
      if (available !== null || price !== null) {
        return {
          available,
          price,
          source: "official",
          server: normalizedServer,
        };
      }
    }

    // Some deployments return getPrices-like data from getAvailability.
    const prices = normalizePrices(data, { service: code, country: countryId });
    const entry = priceEntry(prices, countryId, code);
    if (entry) {
      return {
        available: entry.count,
        price: entry.cost,
        source: "price-shaped",
        server: normalizedServer,
      };
    }

    // Observed S2-style map: { wa: 48383, tg: 45294, ... }.
    // We can safely identify the requested service's count, but the map carries
    // no documented price field, so price remains null.
    const direct = finiteNonNegative(data[code]);
    if (direct !== null) {
      return {
        available: direct,
        price: null,
        source: "service-count-map",
        server: normalizedServer,
      };
    }

    // A safe composite variant, only when the exact requested key exists.
    const compositeKeys = [
      `${code}_${countryId}`,
      `${code}:${countryId}`,
      `${countryId}_${code}`,
      `${countryId}:${code}`,
    ];
    for (const key of compositeKeys) {
      const value = finiteNonNegative(data[key]);
      if (value !== null) {
        return {
          available: value,
          price: null,
          source: "composite-count-map",
          server: normalizedServer,
        };
      }
    }

    const nested = data[String(countryId)];
    if (isPlainObject(nested)) {
      const value = finiteNonNegative(nested[code]);
      if (value !== null) {
        return {
          available: value,
          price: null,
          source: "country-service-count-map",
          server: normalizedServer,
        };
      }
    }
  }

  return {
    available: null,
    price: null,
    source: "unrecognized",
    server: normalizedServer,
  };
}

function makeCacheKey(action, parts) {
  return `${action}:${parts.map((x) => String(x ?? "*")).join(":")}`;
}

function serviceDisplayName(code) {
  if (code === "wa") return "WhatsApp";
  if (code === "tg") return "Telegram";
  return code.toUpperCase();
}

export class NokosClient {
  constructor(options = {}) {
    const apiKey = String(options.apiKey ?? "").trim();
    if (!apiKey) throw new TypeError("NOKOS_API_KEY wajib diisi.");

    this.apiKey = apiKey;
    this.scope = ["full", "readonly", "unknown"].includes(options.scope)
      ? options.scope
      : "unknown";
    this.detectedScope = this.scope;
    this.timeoutMs = Math.max(3000, Number(options.timeoutMs) || 20000);
    this.maxRetries = Math.max(0, Math.min(5, Number(options.maxRetries) || 2));
    this.retryBaseMs = Math.max(250, Number(options.retryBaseMs) || 1000);
    this.priceCacheTtlMs = Math.max(1000, Number(options.priceCacheTtlMs) || 20000);
    this.metaCacheTtlMs = Math.max(10000, Number(options.metaCacheTtlMs) || 10 * 60 * 1000);

    this.http = axios.create({
      baseURL: options.baseURL || NOKOS_API_BASE,
      timeout: this.timeoutMs,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    });

    // Official docs say read endpoints are limited per minute. The user's live
    // logs showed getPrices enforcing 30/60s, so getPrices is deliberately more
    // conservative than the generic read limiter.
    this.readLimiter = new SerialLimiter(options.readMinIntervalMs ?? 1100);
    this.priceLimiter = new SerialLimiter(options.priceMinIntervalMs ?? 2100);
    this.numberLimiter = new SerialLimiter(options.numberMinIntervalMs ?? 3100);
    this.depositLimiter = new SerialLimiter(options.depositMinIntervalMs ?? 31000);

    this.cache = new PromiseCache();
  }

  clearCache() {
    this.cache.clear();
  }

  _assertScope(action) {
    if (this.detectedScope !== "readonly") return;
    if (!READONLY_ALLOWED.has(action)) {
      throw new NokosApiError(
        `API key NOKOS readonly tidak mengizinkan action ${action}.`,
        { action, status: 403, code: "READONLY_SCOPE" },
      );
    }
  }

  _extractPayload(action, envelope) {
    if (!isPlainObject(envelope)) {
      throw new NokosApiError("NOKOS mengembalikan JSON dengan tipe yang tidak valid.", {
        action,
        responsePreview: safePreview(envelope),
      });
    }

    if (envelope.success !== true) {
      const message = String(envelope.error || envelope.message || "NOKOS request gagal.");
      throw new NokosApiError(message, {
        action,
        code: envelope.code ?? null,
        responsePreview: safePreview(envelope),
      });
    }

    if (Object.prototype.hasOwnProperty.call(envelope, "data")) {
      return envelope.data;
    }

    // These top-level fallbacks are action-specific. This avoids accepting an
    // arbitrary success object as valid business data.
    const topLevelField = {
      getServices: "services",
      getCountries: "countries",
      getPrices: "prices",
      getAvailability: "availability",
    }[action];

    if (topLevelField && Object.prototype.hasOwnProperty.call(envelope, topLevelField)) {
      return envelope[topLevelField];
    }

    throw new NokosApiError(
      `NOKOS ${action} sukses tetapi payload tidak dikenali.`,
      { action, responsePreview: safePreview(envelope) },
    );
  }

  async _schedule(action, method, task) {
    const upper = String(method).toUpperCase();
    if (action === "getPrices") {
      return this.priceLimiter.schedule(() => this.readLimiter.schedule(task));
    }
    if (upper === "GET") {
      return this.readLimiter.schedule(task);
    }
    if (action === "getNumber") {
      return this.numberLimiter.schedule(task);
    }
    if (action === "createDeposit") {
      return this.depositLimiter.schedule(task);
    }
    return task();
  }

  _canRetry(method, idempotencyKey, action) {
    if (String(method).toUpperCase() === "GET") return true;
    if (idempotencyKey) return true;
    // Do not automatically retry setStatus status=3 (resend) or other
    // non-idempotent writes, because duplicate side effects are possible.
    return false;
  }

  async request(
    action,
    {
      method = "GET",
      query = {},
      body = null,
      idempotencyKey = null,
      idempotencyHeader = "X-Idempotency-Key",
      retries = this.maxRetries,
    } = {},
  ) {
    this._assertScope(action);
    const upper = String(method).toUpperCase();
    const retryable = this._canRetry(upper, idempotencyKey, action);
    const attempts = retryable ? Math.max(0, Math.min(5, Number(retries) || 0)) + 1 : 1;

    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this._schedule(action, upper, async () => {
          const headers = {};
          let data;
          if (body && upper !== "GET") {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            data = new URLSearchParams();
            for (const [key, value] of Object.entries(body)) {
              if (value !== undefined && value !== null && value !== "") {
                data.set(key, String(value));
              }
            }
          }

          if (idempotencyKey) {
            const header =
              idempotencyHeader === "Idempotency-Key"
                ? "Idempotency-Key"
                : "X-Idempotency-Key";
            headers[header] = String(idempotencyKey).slice(0, 100);
          }

          let response;
          try {
            response = await this.http.request({
              method: upper,
              params: { action, ...query },
              headers,
              data,
            });
          } catch (cause) {
            const status = cause?.response?.status ?? null;
            const retryAfterMs = parseRetryAfter(cause?.response?.headers?.["retry-after"]);
            throw new NokosApiError(
              cause?.code === "ECONNABORTED"
                ? `NOKOS ${action} timeout.`
                : `NOKOS ${action} network error: ${cause?.message || "unknown"}`,
              { action, status, retryAfterMs, cause },
            );
          }

          let envelope = response.data;
          if (typeof envelope === "string") {
            try {
              envelope = JSON.parse(envelope);
            } catch {
              throw new NokosApiError(
                `NOKOS ${action} mengembalikan JSON tidak valid (HTTP ${response.status}).`,
                {
                  action,
                  status: response.status,
                  responsePreview: safePreview(response.data),
                },
              );
            }
          }

          if (response.status < 200 || response.status >= 300) {
            const message = String(
              envelope?.error || envelope?.message || `HTTP ${response.status}`,
            );
            const error = new NokosApiError(message, {
              action,
              status: response.status,
              code: envelope?.code ?? null,
              retryAfterMs: parseRetryAfter(response.headers?.["retry-after"]),
              responsePreview: safePreview(envelope),
            });
            if (error.readonlyScope) this.detectedScope = "readonly";
            throw error;
          }

          try {
            return this._extractPayload(action, envelope);
          } catch (error) {
            if (error instanceof NokosApiError) {
              error.status ??= response.status;
              if (error.readonlyScope) this.detectedScope = "readonly";
            }
            throw error;
          }
        });
      } catch (error) {
        lastError = error instanceof NokosApiError
          ? error
          : new NokosApiError(String(error?.message || error), { action, cause: error });

        if (lastError.readonlyScope) this.detectedScope = "readonly";
        const shouldRetry = retryable && attempt + 1 < attempts && lastError.transient;
        if (!shouldRetry) throw lastError;

        const exponential = this.retryBaseMs * 2 ** attempt;
        const jitter = Math.floor(Math.random() * Math.max(100, this.retryBaseMs / 2));
        const waitMs = Math.max(lastError.retryAfterMs || 0, exponential + jitter);
        await sleep(Math.min(waitMs, 65000));
      }
    }
    throw lastError;
  }

  async getBalance() {
    const data = await this.request("getBalance");
    const balance = finiteNonNegative(data?.balance);
    if (balance === null) {
      throw new NokosApiError("Response getBalance tidak memiliki balance valid.", {
        action: "getBalance",
        responsePreview: safePreview(data),
      });
    }
    return { balance };
  }

  async getServices({ force = false } = {}) {
    const key = "meta:services";
    const cached = !force && this.cache.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const data = await this.request("getServices");
      const services = normalizeServices(data);
      if (!services.length) {
        throw new NokosApiError("getServices mengembalikan daftar kosong.", {
          action: "getServices",
          responsePreview: safePreview(data),
        });
      }
      return services;
    })();
    return this.cache.set(key, this.metaCacheTtlMs, promise);
  }

  async getCountries({ force = false } = {}) {
    const key = "meta:countries";
    const cached = !force && this.cache.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const data = await this.request("getCountries");
      const countries = normalizeCountries(data);
      if (!countries.length) {
        throw new NokosApiError("getCountries mengembalikan daftar kosong.", {
          action: "getCountries",
          responsePreview: safePreview(data),
        });
      }
      return countries;
    })();
    return this.cache.set(key, this.metaCacheTtlMs, promise);
  }

  _priceCacheKey(service, country, server) {
    return makeCacheKey("prices", [server, service || "*", country ?? "*"]);
  }

  async getPrices({ service = null, country = null, server = "s2", force = false } = {}) {
    const normalizedServer = normalizeServer(server);
    const code = service ? normalizeServiceCode(service) : null;
    const countryId = country === null || country === undefined ? null : normalizeCountryId(country);
    const key = this._priceCacheKey(code, countryId, normalizedServer);

    const cached = !force && this.cache.get(key);
    if (cached) return cached;

    const query = { server: normalizedServer };
    if (code) query.service = code;
    if (countryId !== null) query.country = countryId;

    const promise = (async () => {
      const raw = await this.request("getPrices", { query });
      const prices = normalizePrices(raw, { service: code, country: countryId });
      if (!Object.keys(prices).length) {
        throw new NokosApiError("getPrices mengembalikan format/data kosong.", {
          action: "getPrices",
          responsePreview: safePreview(raw),
        });
      }
      return prices;
    })();

    return this.cache.set(key, this.priceCacheTtlMs, promise);
  }

  async getPrice({ service, country = NOKOS_DEFAULT_COUNTRY, server = "s2", force = false } = {}) {
    const code = normalizeServiceCode(service);
    const countryId = normalizeCountryId(country);
    const normalizedServer = normalizeServer(server);

    // Reuse a recent service-wide catalog before making an exact API request.
    if (!force) {
      const broadKey = this._priceCacheKey(code, null, normalizedServer);
      const broad = this.cache.get(broadKey);
      if (broad) {
        const item = priceEntry(await broad, countryId, code);
        if (item) return { ...item, service: code, country: countryId, server: normalizedServer };
      }
    }

    const prices = await this.getPrices({
      service: code,
      country: countryId,
      server: normalizedServer,
      force,
    });
    const item = priceEntry(prices, countryId, code);
    if (!item) {
      throw new NokosApiError(
        `Harga/stok ${code} country ${countryId} server ${normalizedServer} tidak tersedia.`,
        { action: "getPrices" },
      );
    }
    return { ...item, service: code, country: countryId, server: normalizedServer };
  }

  async getAvailability({
    service,
    country = NOKOS_DEFAULT_COUNTRY,
    server = "s2",
    supplementPrice = true,
  } = {}) {
    const code = normalizeServiceCode(service);
    const countryId = normalizeCountryId(country);
    const normalizedServer = normalizeServer(server);

    let parsed;
    let availabilityError = null;
    try {
      const raw = await this.request("getAvailability", {
        query: { service: code, country: countryId, server: normalizedServer },
      });
      parsed = normalizeAvailability(raw, {
        service: code,
        country: countryId,
        server: normalizedServer,
      });
    } catch (error) {
      availabilityError = error;
      parsed = {
        available: null,
        price: null,
        source: "availability-error",
        server: normalizedServer,
      };
    }

    if (supplementPrice && (parsed.price === null || parsed.available === null)) {
      try {
        const item = await this.getPrice({
          service: code,
          country: countryId,
          server: normalizedServer,
        });
        parsed = {
          available: parsed.available ?? item.count,
          price: parsed.price ?? item.cost,
          source: parsed.source === "unrecognized" || parsed.source === "availability-error"
            ? "getPrices-fallback"
            : `${parsed.source}+getPrices`,
          server: normalizedServer,
        };
      } catch (priceError) {
        // If the observed availability map at least provided an exact stock count,
        // return that count instead of replacing it with an "unknown format" error.
        if (parsed.available !== null) return parsed;
        if (availabilityError) throw availabilityError;
        throw priceError;
      }
    }

    if (parsed.available === null && parsed.price === null) {
      if (availabilityError) throw availabilityError;
      throw new NokosApiError(
        `getAvailability tidak memiliki data yang dapat dipetakan untuk ${code}/${countryId}/${normalizedServer}.`,
        { action: "getAvailability" },
      );
    }
    return parsed;
  }

  async getNumber({
    service,
    country = NOKOS_DEFAULT_COUNTRY,
    server = "s2",
    operator = "any",
    idempotencyKey,
  } = {}) {
    this._assertScope("getNumber");
    const code = normalizeServiceCode(service);
    const countryId = normalizeCountryId(country);
    const normalizedServer = normalizeServer(server);
    const operatorValue = String(operator || "any").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(operatorValue)) {
      throw new TypeError("Operator NOKOS tidak valid.");
    }
    if (!idempotencyKey) {
      throw new TypeError("getNumber wajib memakai idempotencyKey untuk mencegah double order.");
    }

    const data = await this.request("getNumber", {
      method: "POST",
      body: {
        service: code,
        country: countryId,
        server: normalizedServer,
        operator: operatorValue,
      },
      idempotencyKey,
      idempotencyHeader: "X-Idempotency-Key",
    });

    const activationId = String(data?.activation_id ?? "").trim();
    const phone = String(data?.phone ?? "").replace(/^\+/, "").trim();
    const price = finiteNonNegative(data?.price);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(activationId)) {
      throw new NokosApiError("getNumber mengembalikan activation_id tidak valid.", {
        action: "getNumber",
        responsePreview: safePreview(data),
      });
    }
    if (!/^\d{5,20}$/.test(phone)) {
      throw new NokosApiError("getNumber mengembalikan nomor telepon tidak valid.", {
        action: "getNumber",
        responsePreview: safePreview(data),
      });
    }

    return {
      activation_id: activationId,
      phone,
      price,
      expires_at: String(data?.expires_at ?? ""),
    };
  }

  async getStatus(id) {
    const activationId = String(id ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(activationId)) {
      throw new TypeError("Activation ID NOKOS tidak valid.");
    }
    const data = await this.request("getStatus", { query: { id: activationId } });
    const status = String(data?.status ?? "").trim();
    if (!status) {
      throw new NokosApiError("getStatus tidak mengembalikan status.", {
        action: "getStatus",
        responsePreview: safePreview(data),
      });
    }
    return {
      status,
      code: data?.code == null ? null : String(data.code),
      sms: data?.sms == null ? null : String(data.sms),
    };
  }

  async setStatus(id, status) {
    this._assertScope("setStatus");
    const activationId = String(id ?? "").trim();
    const value = Number.parseInt(String(status), 10);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(activationId)) {
      throw new TypeError("Activation ID NOKOS tidak valid.");
    }
    if (![-1, 3, 6, 8].includes(value)) {
      throw new TypeError("Status NOKOS hanya boleh -1, 3, 6, atau 8.");
    }
    return this.request("setStatus", {
      method: "POST",
      body: { id: activationId, status: value },
      retries: 0,
    });
  }

  async cancelActivation(id) {
    this._assertScope("cancelActivation");
    const activationId = String(id ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(activationId)) {
      throw new TypeError("Activation ID NOKOS tidak valid.");
    }
    return this.request("cancelActivation", {
      method: "POST",
      body: { id: activationId },
      retries: 0,
    });
  }

  async createDeposit(amount, { idempotencyKey } = {}) {
    this._assertScope("createDeposit");
    const value = Math.round(Number(amount));
    if (!Number.isInteger(value) || value < 10000 || value > 10000000) {
      throw new TypeError("Nominal deposit harus Rp10.000 sampai Rp10.000.000.");
    }
    if (!idempotencyKey) {
      throw new TypeError("createDeposit wajib memakai idempotencyKey.");
    }

    const data = await this.request("createDeposit", {
      method: "POST",
      body: { amount: value },
      idempotencyKey,
      idempotencyHeader: "Idempotency-Key",
    });

    const transactionId = String(data?.transaction_id ?? "").trim();
    const qrisUrl = String(data?.qris_url ?? "").trim();
    const payAmount = finiteNonNegative(data?.pay_amount);
    const providerAmount = finiteNonNegative(data?.amount);
    if (!/^[A-Za-z0-9_-]{4,100}$/.test(transactionId)) {
      throw new NokosApiError("createDeposit mengembalikan transaction_id tidak valid.", {
        action: "createDeposit",
        responsePreview: safePreview(data),
      });
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(qrisUrl);
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl || parsedUrl.protocol !== "https:") {
      throw new NokosApiError("createDeposit mengembalikan qris_url tidak valid.", {
        action: "createDeposit",
        responsePreview: safePreview(data),
      });
    }
    if (payAmount === null || payAmount <= 0) {
      throw new NokosApiError("createDeposit mengembalikan pay_amount tidak valid.", {
        action: "createDeposit",
        responsePreview: safePreview(data),
      });
    }

    return {
      transaction_id: transactionId,
      qris_url: parsedUrl.toString(),
      amount: providerAmount,
      pay_amount: payAmount,
      expires_at: String(data?.expires_at ?? ""),
      bonus_percent: finiteNonNegative(data?.bonus_percent),
      bonus_amount: finiteNonNegative(data?.bonus_amount),
    };
  }

  async checkDeposit(transactionId) {
    const id = String(transactionId ?? "").trim();
    if (!/^[A-Za-z0-9_-]{4,100}$/.test(id)) {
      throw new TypeError("Transaction ID deposit NOKOS tidak valid.");
    }
    const data = await this.request("checkDeposit", {
      query: { transaction_id: id },
    });
    const returnedId = String(data?.transaction_id ?? "").trim();
    if (returnedId !== id) {
      throw new NokosApiError("checkDeposit mengembalikan transaction_id berbeda.", {
        action: "checkDeposit",
        responsePreview: safePreview(data),
      });
    }
    const status = String(data?.status ?? "").toLowerCase();
    if (!["pending", "paid", "expired", "failed"].includes(status)) {
      throw new NokosApiError("checkDeposit mengembalikan status tidak dikenal.", {
        action: "checkDeposit",
        responsePreview: safePreview(data),
      });
    }
    return {
      transaction_id: id,
      status,
      amount: finiteNonNegative(data?.amount),
      pay_amount: finiteNonNegative(data?.pay_amount),
      expires_at: String(data?.expires_at ?? ""),
      paid_at: data?.paid_at == null ? null : String(data.paid_at),
      created_at: data?.created_at == null ? null : String(data.created_at),
    };
  }

  async getHistory({ limit = 20, offset = 0, status = null } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 20));
    const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
    const query = { limit: safeLimit, offset: safeOffset };
    if (status) query.status = String(status);
    return this.request("getHistory", { query });
  }

  async listServices({ force = false } = {}) {
    try {
      return await this.getServices({ force });
    } catch (metadataError) {
      // readonly keys cannot call getServices according to the current docs.
      const catalogs = await Promise.allSettled([
        this.getPrices({ server: "s2", force }),
        this.getPrices({ server: "s1", force }),
      ]);
      const codes = new Set();
      for (const result of catalogs) {
        if (result.status !== "fulfilled") continue;
        for (const countryData of Object.values(result.value)) {
          for (const code of Object.keys(countryData || {})) codes.add(code);
        }
      }
      if (!codes.size) throw metadataError;
      return [...codes]
        .sort()
        .map((code) => ({ code, name: serviceDisplayName(code) }));
    }
  }

  async listCountries({ force = false } = {}) {
    try {
      return await this.getCountries({ force });
    } catch (metadataError) {
      const catalogs = await Promise.allSettled([
        this.getPrices({ server: "s2", force }),
        this.getPrices({ server: "s1", force }),
      ]);
      const ids = new Set();
      for (const result of catalogs) {
        if (result.status !== "fulfilled") continue;
        for (const id of Object.keys(result.value)) {
          const n = integerNonNegative(id);
          if (n !== null) ids.add(n);
        }
      }
      if (!ids.size) throw metadataError;
      return [...ids].sort((a, b) => a - b).map((id) => ({
        id,
        name: id === 6 ? "Indonesia" : `Country ${id}`,
        prefix: id === 6 ? "+62" : "",
      }));
    }
  }
}

export function defaultResellerStore() {
  return {
    version: 1,
    settings: { markupFixed: 0 },
    users: {},
    deposits: {},
    orders: {},
    purchaseAttempts: {},
  };
}

export function normalizeResellerStore(raw) {
  if (!isPlainObject(raw)) {
    throw new Error("NOKOS_RESELLER_DB_INVALID");
  }
  const base = defaultResellerStore();
  const markup = finiteNonNegative(raw?.settings?.markupFixed);

  // Preserve unknown fields to avoid destroying data created by the old module.
  return {
    ...raw,
    version: 1,
    settings: {
      ...(isPlainObject(raw.settings) ? raw.settings : {}),
      markupFixed: markup === null ? 0 : Math.round(markup),
    },
    users: isPlainObject(raw.users) ? raw.users : base.users,
    deposits: isPlainObject(raw.deposits) ? raw.deposits : base.deposits,
    orders: isPlainObject(raw.orders) ? raw.orders : base.orders,
    purchaseAttempts: isPlainObject(raw.purchaseAttempts)
      ? raw.purchaseAttempts
      : base.purchaseAttempts,
  };
}

export function ensureResellerUser(store, userId) {
  const id = String(userId ?? "").trim();
  if (!/^\d{1,20}$/.test(id)) throw new TypeError("Telegram user ID tidak valid.");
  if (!isPlainObject(store.users[id])) {
    const now = new Date().toISOString();
    store.users[id] = {
      balance: 0,
      totalDeposited: 0,
      totalSpent: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  const user = store.users[id];
  for (const key of ["balance", "totalDeposited", "totalSpent"]) {
    const value = finiteNonNegative(user[key]);
    user[key] = value === null ? 0 : Math.round(value);
  }
  user.updatedAt ??= new Date().toISOString();
  return user;
}

export function resellerSellPrice(providerPrice, settings) {
  const cost = finiteNonNegative(providerPrice);
  if (cost === null) throw new TypeError("Harga provider NOKOS tidak valid.");
  const markup = finiteNonNegative(settings?.markupFixed) ?? 0;
  return Math.round(cost) + Math.round(markup);
}

export function makeCallbackToken(value, length = 20) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")
    .slice(0, Math.max(8, Math.min(40, Number(length) || 20)));
}

export function makeIdempotencyKey(prefix, parts) {
  const hash = crypto
    .createHash("sha256")
    .update(parts.map((x) => String(x ?? "")).join(":"))
    .digest("hex");
  return `${String(prefix || "nokos").replace(/[^a-z0-9_-]/gi, "").slice(0, 20)}-${hash.slice(0, 70)}`
    .slice(0, 100);
}

export class NokosResellerStore {
  constructor(options = {}) {
    this.file = options.file || NOKOS_RESELLER_DB;
    this.queue = Promise.resolve();
  }

  async _load() {
    try {
      const text = await fs.readFile(this.file, "utf8");
      return normalizeResellerStore(JSON.parse(text));
    } catch (error) {
      if (error?.code === "ENOENT") return defaultResellerStore();
      throw error;
    }
  }

  async _save(store) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    try {
      await fs.writeFile(temp, JSON.stringify(store, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.rename(temp, this.file);
    } catch (error) {
      await fs.unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  async read(reader = (store) => store) {
    await this.queue.catch(() => undefined);
    const store = await this._load();
    return reader(store);
  }

  mutate(mutator) {
    const job = this.queue.then(async () => {
      const store = await this._load();
      const result = await mutator(store);
      await this._save(store);
      return result;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  async wallet(userId) {
    return this.read((store) => {
      const raw = store.users[String(userId)] || {};
      return {
        userId: String(userId),
        balance: Math.round(finiteNonNegative(raw.balance) ?? 0),
        totalDeposited: Math.round(finiteNonNegative(raw.totalDeposited) ?? 0),
        totalSpent: Math.round(finiteNonNegative(raw.totalSpent) ?? 0),
        markupFixed: Math.round(finiteNonNegative(store.settings?.markupFixed) ?? 0),
      };
    });
  }

  async settings() {
    return this.read((store) => ({ ...store.settings }));
  }

  async order(id) {
    return this.read((store) => store.orders[String(id)] || null);
  }

  async ordersForUser(userId, limit = 10) {
    const id = String(userId);
    return this.read((store) =>
      Object.values(store.orders || {})
        .filter((order) => String(order?.userId ?? "") === id)
        .sort((a, b) => String(b?.createdAt ?? "").localeCompare(String(a?.createdAt ?? "")))
        .slice(0, Math.max(1, Math.min(50, Number(limit) || 10))),
    );
  }

  async depositBySelector(selector) {
    const value = String(selector ?? "");
    return this.read((store) =>
      store.deposits[value] ||
      Object.values(store.deposits || {}).find(
        (item) => String(item?.callbackToken ?? "") === value,
      ) ||
      null,
    );
  }
}

export function friendlyNokosError(error) {
  const message = String(error?.message || error || "NOKOS error");
  if (/readonly|read.?only|scope/i.test(message)) {
    return "API key NOKOS readonly tidak dapat menjalankan operasi write ini.";
  }
  if (error?.status === 401 || /api key.*valid/i.test(message)) {
    return "API key NOKOS tidak valid.";
  }
  if (error?.status === 403 || /whitelist/i.test(message)) {
    return "Request NOKOS ditolak. Periksa scope API key dan IP whitelist.";
  }
  if (error?.status === 429 || /rate limit|too many requests/i.test(message)) {
    return "Rate limit NOKOS tercapai. Request sudah dibatasi; coba lagi setelah window provider selesai.";
  }
  if (/NO_NUMBERS|stok kosong/i.test(message)) return "Stok nomor sedang kosong.";
  if (/insufficient balance|saldo kurang/i.test(message)) {
    return "Saldo akun provider NOKOS tidak mencukupi.";
  }
  if (/timeout|network|ECONN|EAI_AGAIN|ENOTFOUND/i.test(message)) {
    return "Koneksi ke NOKOS sedang bermasalah. Coba lagi.";
  }
  return message.length > 220 ? "NOKOS API mengalami error." : message;
}
