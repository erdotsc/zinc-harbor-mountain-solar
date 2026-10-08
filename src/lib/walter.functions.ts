import { createServerFn } from "@tanstack/react-start";
import type { AltsMap, StockMap } from "./types";

/** Always start here — bare Account/Login has returnUrl:null and cannot complete OIDC. */
const PORTAL =
  "https://toolstation.walter-tools.com/AdminPortal/waltertoolsturkey/walter";
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (json.access_token) return json.access_token;
  throw new Error(
    json.error_description || json.error || "API anahtarı reddedildi",
  );
}

async function tokenFromPassword(
  username: string,
  password: string,
): Promise<string> {
  const jar = new Map<string, string>();

  // 1) Open AdminPortal → redirects to Account/Login with full OIDC ReturnUrl
  const loginPage = await followGet(PORTAL, jar);
  const anti = loginPage.html.match(/"antiForgeryToken":"([^"]+)"/)?.[1];
  const retRaw = loginPage.html.match(/"returnUrl":"((?:\\.|[^"\\])*)"/)?.[1];
  const loginUrlRaw = loginPage.html.match(
    /"loginUrl":"((?:\\.|[^"\\])*)"/,
  )?.[1];

  if (!anti || !retRaw || !loginUrlRaw) {
    throw new Error(
      "Walter giriş sayfası okunamadı (token alanları eksik). Ağ engeli veya portal değişmiş olabilir.",
    );
  }

  const returnUrl = decodeJsonString(retRaw);
  const loginUrl = decodeJsonString(loginUrlRaw);
  if (!returnUrl || returnUrl === "null") {
    throw new Error(
      "Walter OIDC returnUrl alınamadı. Portal adresi üzerinden yeniden deneyin.",
    );
  }

  // 2) POST credentials like the green OK button
  const form = new URLSearchParams({
    __RequestVerificationToken: anti,
    returnUrl,
    username,
    password,
  });

  let next = loginUrl;
  let body: string | undefined = form.toString();
  let method: "GET" | "POST" = "POST";

  for (let i = 0; i < 14; i++) {
    const res = await fetch(next, {
      method,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: cookieHeader(jar),
        Accept: "text/html,application/xhtml+xml,application/json,*/*",
        ...(method === "POST"
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              Origin: ORIGIN,
              Referer: loginPage.url,
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
      body = undefined;
      continue;
    }

    const text = await res.text();
    const token = extractToken(text);
    if (token) return token;

    if (
      /WrongUserNameOrPassword|InvalidUsernameOrPassword|wrong user name or password/i.test(
        text,
      )
    ) {
      throw new Error("Walter kullanıcı adı veya şifreyi reddetti");
    }

    const posted = autoPostForm(text, next);
    if (posted) {
      next = posted.url;
      body = posted.body;
      method = "POST";
      continue;
    }

    // Still on login page after failed submit
    if (text.includes("antiForgeryToken") && text.includes("loginUrl")) {
      throw new Error("Walter kullanıcı adı veya şifreyi reddetti");
    }
    break;
  }
  throw new Error("Walter oturumu açıldı ama erişim jetonu alınamadı");
}

async function followGet(
  start: string,
  jar: Map<string, string>,
): Promise<{ html: string; url: string }> {
  let url = start;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: cookieHeader(jar),
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });
    absorbCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Walter yönlendirme eksik");
      url = new URL(loc, url).href;
      continue;
    }
    const html = await res.text();
    return { html, url };
  }
  throw new Error("Walter giriş sayfasına ulaşılamadı");
}

function extractToken(text: string): string | null {
  const m =
    text.match(/name=["']access_token["'][^>]*value=["']([^"']+)["']/i) ||
    text.match(/value=["']([^"']+)["'][^>]*name=["']access_token["']/i) ||
    text.match(/"access_token"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

function autoPostForm(
  html: string,
  base: string,
): { url: string; body: string } | null {
  const action = html.match(/<form[^>]*action=["']([^"']+)["']/i)?.[1];
  if (!action) return null;
  const params = new URLSearchParams();
  for (const input of html.matchAll(/<input[^>]*>/gi)) {
    const tag = input[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] ?? "";
    if (name) params.set(name, decodeHtml(value));
  }
  if (
    !params.has("access_token") &&
    !params.has("id_token") &&
    !params.has("code")
  ) {
    return null;
  }
  return {
    url: new URL(decodeHtml(action), base).href,
    body: params.toString(),
  };
}

async function fetchReport(token: string): Promise<unknown> {
  const urls = [
    `${ORIGIN}/AdminPortal/ERP/ItemsStatus/GenerateReport`,
    `${ORIGIN}/ERP/ItemsStatus/GenerateReport`,
  ];
  let last = "";
  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
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

const ID_KEYS = [
  "itemid",
  "itemId",
  "id",
  "articleid",
  "productid",
  "tool",
  "urunid",
];
const QTY_KEYS = [
  "quantity",
  "qty",
  "currentquantity",
  "stockquantity",
  "availablequantity",
  "guncelmiktar",
];
const REORDER_KEYS = [
  "reorderpoint",
  "minimumquantity",
  "minquantity",
  "orderpoint",
  "reorder",
];
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
      alts[id] = alt
        .split(/[\s,;]+/)
        .filter((p) => p && p.toUpperCase() !== "ORTAK");
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

function pickNum(
  rec: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const [k, v] of Object.entries(rec)) {
    const nk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!keys.some((w) => nk === w.toLowerCase().replace(/[^a-z0-9]/g, "")))
      continue;
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbCookies(jar: Map<string, string>, res: Response) {
  const lines: string[] =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  // Fallback for runtimes that only expose a single set-cookie
  if (!lines.length) {
    const single = res.headers.get("set-cookie");
    if (single) lines.push(single);
  }
  for (const line of lines) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function decodeJsonString(s: string) {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
