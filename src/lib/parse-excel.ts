import * as XLSX from "xlsx";
import type { AltsMap, ProgramsMap, StockMap } from "./types";

function cellStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function cellInt(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function normHeader(h: unknown): string {
  return cellStr(h)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function findCol(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (aliases.some((a) => h === a || h.includes(a))) return i;
  }
  return -1;
}

export function parseWorkbook(data: ArrayBuffer): {
  stok: StockMap;
  alts: AltsMap;
  programs: ProgramsMap;
} {
  const wb = XLSX.read(data, { type: "array" });
  const stok: StockMap = {};
  const alts: AltsMap = {};
  const programs: ProgramsMap = {};

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: "",
    }) as unknown[][];
    if (!rows.length) continue;
    const headers = rows[0].map(normHeader);
    const upper = name.toUpperCase();

    if (upper === "STOK" || upper === "STOCK") {
      Object.assign(stok, rowsToStock(rows));
      continue;
    }
    if (upper === "DB") {
      Object.assign(alts, rowsToAlts(rows));
      continue;
    }

    const looksLikeStock =
      findCol(headers, ["urun id", "takim", "tool", "sap"]) >= 0 &&
      findCol(headers, ["guncel", "miktar", "qty", "stok", "stock"]) >= 0;

    if (looksLikeStock && Object.keys(stok).length === 0) {
      Object.assign(stok, rowsToStock(rows));
      continue;
    }

    const toolCol = findCol(headers, ["takim", "tool", "urun id"]);
    const col = toolCol >= 0 ? toolCol : 0;
    const tools: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const t = cellStr(rows[i]?.[col]);
      if (t && !t.startsWith("*")) tools.push(t);
    }
    if (tools.length) programs[name] = tools;
  }

  return { stok, alts, programs };
}

function rowsToStock(rows: unknown[][]): StockMap {
  const headers = rows[0].map(normHeader);
  const idCol = findCol(headers, ["urun id", "takim", "tool", "article", "malzeme"]);
  const sapCol = findCol(headers, ["sap"]);
  const qtyCol = findCol(headers, [
    "guncel miktar",
    "guncel",
    "miktar",
    "qty",
    "stok",
    "stock",
    "current",
  ]);
  const reorderCol = findCol(headers, [
    "siparis noktasi",
    "siparis",
    "reorder",
    "min",
    "minimum",
  ]);
  const idI = idCol >= 0 ? idCol : 0;
  const sapI = sapCol >= 0 ? sapCol : 1;
  const qtyI = qtyCol >= 0 ? qtyCol : 2;
  const reorderI = reorderCol >= 0 ? reorderCol : 3;
  const stok: StockMap = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = cellStr(r?.[idI]);
    if (!id) continue;
    stok[id] = {
      sap: cellStr(r?.[sapI]),
      qty: cellInt(r?.[qtyI]),
      reorder: cellInt(r?.[reorderI]),
    };
  }
  return stok;
}

function rowsToAlts(rows: unknown[][]): AltsMap {
  const alts: AltsMap = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = cellStr(r?.[0]);
    if (!id) continue;
    const raw = cellStr(r?.[2]);
    alts[id] = raw
      ? raw.split(/[\s,;]+/).filter((p) => p && p.toUpperCase() !== "ORTAK")
      : [];
  }
  return alts;
}
