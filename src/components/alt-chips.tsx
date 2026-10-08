import { useStockStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EMPTY: string[] = [];

export function AltChips({ toolId }: { toolId: string }) {
  const alts = useStockStore((s) => s.alts[toolId] ?? EMPTY);
  const stok = useStockStore((s) => s.stok);
  if (!alts.length) {
    return <span className="text-xs text-muted">Yok</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {alts.map((id) => {
        const q = stok[id]?.qty;
        const has = q != null && q > 0;
        return (
          <span
            key={id}
            title={`Stok: ${q ?? "?"}`}
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-mono text-xs tabular-nums",
              has
                ? "border-ok/40 bg-ok/10 text-ok"
                : "border-danger/30 bg-danger/10 text-danger",
            )}
          >
            {id} ({q ?? "?"})
          </span>
        );
      })}
    </div>
  );
}
