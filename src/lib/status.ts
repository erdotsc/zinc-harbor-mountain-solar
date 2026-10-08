import type { StockItem } from "./types";
import { useStockStore } from "./store";

export function stockStatus(item: StockItem | undefined): "ok" | "low" | "critical" | "zero" | "missing" {
  if (!item) return "missing";
  if (item.qty === 0) return "zero";
  if (item.qty < item.reorder) {
    if (item.reorder > 0 && item.qty / item.reorder <= 0.5) return "critical";
    return "low";
  }
  return "ok";
}

export function statusLabel(s: ReturnType<typeof stockStatus>) {
  switch (s) {
    case "ok":
      return "Yeterli";
    case "low":
      return "Düşük";
    case "critical":
      return "Kritik";
    case "zero":
      return "Stok yok";
    default:
      return "Kayıt yok";
  }
}

export function useTool(id: string) {
  const stok = useStockStore((s) => s.stok);
  const alts = useStockStore((s) => s.alts);
  return { item: stok[id], alts: alts[id] ?? [] };
}
