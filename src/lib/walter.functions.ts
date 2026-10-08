import { createServerFn } from "@tanstack/react-start";
import type { AltsMap, StockMap } from "./types";

const PORTAL = "https://toolstation.walter-tools.com/AdminPortal/waltertoolsturkey/walter";
const LOGIN_PAGE = "https://toolstation.walter-tools.com/adminportalidentity/Account/Login";
const ORIGIN = "https://toolstation.walter-tools.com";

type PullInput = { username: string; password: string; apiKey?: string };

export const pullWalterStock = createServerFn({ method: "POST" })
  .validator((data: PullInput) => {
    const username = data.username?.trim();
    const password = data.password ?? "";
    const apiKey = data.apiKey?.trim() || "";
    if (!username || !password) {
      throw new Error("Kullanıcı adı ve şifre gerekli");
    }
    return { username, password, apiKey };
  })
  .handler(async ({ data }) => {
    const token = data.apiKey
      ? await tokenFromApiKey(data.apiKey)
      : await tokenFromPassword(data.username, data.password);
    const raw = await fetchReport(token);
    const mapped = mapStock(raw);
    if (!Object.keys(mapped.stok).length) {
      throw new Error(
        "Giriş oldu ama stok raporu boş veya tanınmadı. Portalden 3 - Stok Excel’ini yükleyin.",
      );
    }
    return {
      count: Object.keys(mapped.stok).length,
      stok: mapped.stok,
      alts: mapped.alts,
      label: `Walter · ${new Date().toLocaleString("tr-TR")}`,
    };
  });

async function tokenFromApiKey(apiKey: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: "erp_client",
    client_secret: apiKey,
    scope: "erp_api",
  });
  const res = await fetch(`${ORIGIN}/adminportalidentity/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (json.access_token) return json.access_token;
  throw new Error(json.error_description || json.error || "API anahtarı reddedildi");
}

async function tokenFromPassword(username: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  let url = LOGIN_PAGE;
  let html = "";
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "TakimStok/1", Cookie: cookieHeader(jar) },
    });
    absorbCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).href;
      continue;
    }
    html = await res.text();
    if (!html.includes("antiForgeryToken")) {
      url = PORTAL;
      continue;
    }
    break;
  }
  const anti = html.match(/"antiForgeryToken":"([^"]+)"/)?.[1];
  const retRaw = html.match(/"returnUrl":"(.*?)"/)?.[1];
  const loginUrl = decodeJsonString(html.match(/"loginUrl":"(.*?)"/)?.[1] ?? "");
  if (!anti || !retRaw || !loginUrl) {
    throw new Error("Walter giriş sayfası okunamadı");
  }
  const form = new URLSearchParams({
    __RequestVerificationToken: anti,
    returnUrl: decodeJsonString(retRaw),
    username,
    password,
  });
  let next = loginUrl;
  let body = form.toString();
  let method = "POST";
  for (let i = 0; i < 12; i++) {
    const res = await fetch(next, {
      method,
      redirect: "manual",
      headers: {
        "User-Agent": "TakimStok/1",
        Cookie: cookieHeader(jar),
        ...(method === "POST"
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              Origin: ORIGIN,
              Referer: url,
            }
          : {}),
      },
      body: method === "POST" ? body : undefined,
    });
    absorbCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      next = new URL(loc, next).href;
      method = "GET";
      body = "";
      continue;
    }
    const text = await res.text();
    const token = extractToken(text);
    if (token) return token;
    if (/WrongUserNameOrPassword|InvalidUsernameOrPassword/i.test(text)) {
      throw new Error("Walter kullanıcı adı veya şifreyi reddetti");
    }
    const posted = autoPostForm(text, next);
    if (posted) {
      next = posted.url;
      body = posted.body;
      method = "POST";
      continue;
    }
    break;
  }
  throw new Error("Walter oturumu açıldı ama erişim jetonu alınamadı");
}

function extractToken(text: string): string | null {
  const m =
    text.match(/name="access_token"[^>]*value="([^"]+)"/i) ||
    text.match(/"access_token"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

function autoPostForm(html: string, base: string): { url: string; body: string } | null {
  const action = html.match(/<form[^>]*action="([^"]+)"/i)?.[1];
  if (!action) return null;
  const params = new URLSearchParams();
  for (const input of html.matchAll(/<input[^>]*>/gi)) {
    const tag = input[0];
    const name = tag.match(/name="([^"]+)"/i)?.[1];
    const value = tag.match(/value="([^"]*)"/i)?.[1] ?? "";
    if (name) params.set(name, decodeHtml(value));
  }
  if (!params.has("access_token") && !params.has("id_token") && !params.has("code")) {
    return null;
  }
  return { url: new URL(decodeHtml(action), base).href, body: params.toString() };
}

async function fetchReport(token: string): Promise<unknown> {
  const urls = [
    `${ORIGIN}/AdminPortal/ERP/ItemsStatus/GenerateReport`,
    `${ORIGIN}/ERP/ItemsStatus/GenerateReport`,
  ];
  let last = "";
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      last = `${res.status} ${url}`;
      continue;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      last = "JSON değil";
    }
  }
  throw new Error(`Stok servisi yanıt vermedi (${last})`);
}

const ID_KEYS = ["itemid", "itemId", "id", "articleid", "productid", "tool", "urunid"];
const QTY_KEYS = ["quantity", "qty", "currentquantity", "stockquantity", "availablequantity", "guncelmiktar"];
const REORDER_KEYS = ["reorderpoint", "minimumquantity", "minquantity", "orderpoint", "reorder"];
const SAP_KEYS = ["sap", "sapnumber", "erpnumber", "externalid"];
const ALT_KEYS = ["alternative", "alternatives", "alternativeitemids"];

function mapStock(raw: unknown): { stok: StockMap; alts: AltsMap } {
  const stok: StockMap = {};
  const alts: AltsMap = {};
  const nodes: unknown[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    nodes.push(v);
    for (const x of Object.values(v as Record<string, unknown>)) walk(x);
  };
  walk(raw);
  for (const node of nodes) {
    const rec = node as Record<string, unknown>;
    const id = pickStr(rec, ID_KEYS);
    const qty = pickNum(rec, QTY_KEYS);
    if (!id || qty == null || !/^\d{4,}$/.test(id)) continue;
    if (stok[id] && qty === 0) continue;
    stok[id] = {
      sap: pickStr(rec, SAP_KEYS) || stok[id]?.sap || "",
      qty,
      reorder: pickNum(rec, REORDER_KEYS) ?? stok[id]?.reorder ?? 0,
    };
    const alt = pickStr(rec, ALT_KEYS);
    if (alt) {
      alts[id] = alt.split(/[\s,;]+/).filter((p) => p && p.toUpperCase() !== "ORTAK");
    }
  }
  return { stok, alts };
}

function pickStr(rec: Record<string, unknown>, keys: string[]): string {
  for (const [k, v] of Object.entries(rec)) {
    const nk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (keys.some((w) => nk === w.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s !== "null") return s.endsWith(".0") ? s.slice(0, -2) : s;
    }
  }
  return "";
}

function pickNum(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const [k, v] of Object.entries(rec)) {
    const nk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!keys.some((w) => nk === w.toLowerCase().replace(/[^a-z0-9]/g, ""))) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbCookies(jar: Map<string, string>, res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function decodeJsonString(s: string) {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

function decodeHtml(s: string) {
  return s
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}
