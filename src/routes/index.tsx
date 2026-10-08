import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CloudDownload,
  FileSpreadsheet,
  FolderOpen,
  Search,
  Upload,
  Wrench,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AltChips } from "@/components/alt-chips";
import { parseNcText, parseToolList } from "@/lib/parse-nc";
import { parseWorkbook } from "@/lib/parse-excel";
import { stockStatus, statusLabel } from "@/lib/status";
import { useStockStore } from "@/lib/store";
import { pullWalterStock } from "@/lib/walter.functions";
import { cn } from "@/lib/utils";
import type { StockItem } from "@/lib/types";

export const Route = createFileRoute("/")({ component: Home });

type Tab = "low" | "program" | "manage" | "excel" | "search";

function Home() {
  const [tab, setTab] = useState<Tab>("low");
  const setHydrated = useStockStore((s) => s.setHydrated);
  const stok = useStockStore((s) => s.stok);
  const programs = useStockStore((s) => s.programs);
  const excelLabel = useStockStore((s) => s.excelLabel);

  useEffect(() => {
    void Promise.resolve(useStockStore.persist.rehydrate()).then(() => setHydrated());
  }, [setHydrated]);

  const lowCount = useMemo(
    () => Object.values(stok).filter((v) => v.qty < v.reorder).length,
    [stok],
  );
  const zeroCount = useMemo(
    () => Object.values(stok).filter((v) => v.qty === 0 && v.reorder > 0).length,
    [stok],
  );

  const tabs: { id: Tab; label: string; icon: typeof Wrench }[] = [
    { id: "low", label: "Düşük stok", icon: AlertTriangle },
    { id: "program", label: "Program kontrolü", icon: Wrench },
    { id: "manage", label: "Programlar", icon: FolderOpen },
    { id: "excel", label: "Excel güncelle", icon: FileSpreadsheet },
    { id: "search", label: "Ara", icon: Search },
  ];

  return (
    <div className="min-h-dvh bg-bg">
      <Toaster theme="dark" position="bottom-right" />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              STAMA / Walter
            </p>
            <h1 className="text-xl font-semibold text-fg sm:text-2xl">
              Takım Stok Kontrol
            </h1>
            <p className="text-sm text-muted">{excelLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Stat label="Takım" value={Object.keys(stok).length} />
            <Stat label="Düşük" value={lowCount} danger />
            <Stat label="Stok 0" value={zeroCount} danger />
            <Stat label="Program" value={Object.keys(programs).length} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "low" && <LowStockPanel />}
        {tab === "program" && <ProgramPanel />}
        {tab === "manage" && <ManagePanel />}
        {tab === "excel" && <ExcelPanel />}
        {tab === "search" && <SearchPanel />}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cn(
          "font-mono text-lg font-semibold tabular-nums",
          danger ? "text-danger" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: StockItem | undefined }) {
  const s = stockStatus(item);
  const tone =
    s === "ok" ? "ok" : s === "low" ? "warn" : s === "missing" ? "muted" : "danger";
  return <Badge tone={tone}>{statusLabel(s)}</Badge>;
}

function LowStockPanel() {
  const stok = useStockStore((s) => s.stok);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "zero" | "critical">("all");

  const items = useMemo(() => {
    let list = Object.entries(stok)
      .filter(([, v]) => v.qty < v.reorder)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.qty - b.qty || a.id.localeCompare(b.id));
    if (filter === "zero") list = list.filter((i) => i.qty === 0);
    if (filter === "critical")
      list = list.filter((i) => i.reorder > 0 && i.qty / i.reorder <= 0.5);
    const nq = q.trim().toLowerCase();
    if (nq)
      list = list.filter(
        (i) => i.id.toLowerCase().includes(nq) || i.sap.toLowerCase().includes(nq),
      );
    return list;
  }, [stok, q, filter]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-1 text-lg font-semibold">Sipariş noktasının altındakiler</h2>
      <p className="mb-4 text-sm text-muted">
        Güncel miktar, sipariş noktasından düşük. Yeşil alternatif = stokta var.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Takım ID veya SAP"
          className="min-h-11 min-w-48 flex-1 rounded-md border border-border bg-bg px-3 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm"
        >
          <option value="all">Tümü</option>
          <option value="zero">Stok 0</option>
          <option value="critical">Kritik (≤ %50)</option>
        </select>
      </div>
      <p className="mb-3 text-sm text-muted">{items.length} kayıt</p>
      <ToolTable
        rows={items.map((i) => ({
          id: i.id,
          sap: i.sap,
          qty: i.qty,
          reorder: i.reorder,
          item: i,
        }))}
      />
    </section>
  );
}

function ProgramPanel() {
  const programs = useStockStore((s) => s.programs);
  const saveProgram = useStockStore((s) => s.saveProgram);
  const stok = useStockStore((s) => s.stok);
  const alts = useStockStore((s) => s.alts);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [info, setInfo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const tools = parseToolList(text);
  const rows = tools.map((id) => {
    const item = stok[id];
    return {
      id,
      sap: item?.sap ?? "",
      qty: item ? item.qty : null,
      reorder: item ? item.reorder : null,
      item,
      alts: (alts[id] ?? []).map((a) => ({ id: a, qty: stok[a]?.qty ?? null })),
    };
  });
  const ok = rows.filter((r) => r.item && r.item.qty >= r.item.reorder).length;
  const low = rows.filter(
    (r) => r.item && r.item.qty > 0 && r.item.qty < r.item.reorder,
  ).length;
  const zero = rows.filter((r) => r.item && r.item.qty === 0).length;
  const missing = rows.filter((r) => !r.item).length;

  function loadSelected() {
    if (!selected || !programs[selected]) return;
    setText(programs[selected].join("\n"));
    setInfo(`${selected} yüklendi`);
  }

  function onNc(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const { name, tools: t } = parseNcText(String(reader.result ?? ""));
      if (!t.length) {
        toast.error("Takım bulunamadı (M101–M105 arası Txxxxx bekleniyor)");
        return;
      }
      const progName = name || file.name.replace(/\.[^.]+$/, "");
      saveProgram(progName, t);
      setText(t.join("\n"));
      setSelected(progName);
      setInfo(`${progName} — ${t.length} takım`);
      toast.success(`${progName}: ${t.length} takım`);
    };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-1 text-lg font-semibold">NC program takım kontrolü</h2>
      <p className="mb-4 text-sm text-muted">
        Kayıtlı program seçin veya .pch dosyası yükleyin. Takımlar M101–M105
        arasındaki T satırlarından okunur.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-h-11 min-w-48 flex-1 rounded-md border border-border bg-bg px-3 text-sm"
        >
          <option value="">Kayıtlı program</option>
          {Object.keys(programs)
            .sort()
            .map((n) => (
              <option key={n} value={n}>
                {n} ({programs[n].length})
              </option>
            ))}
        </select>
        <Button variant="secondary" onClick={loadSelected}>
          Yükle
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".pch,.nc,.txt,.mpf,.cnc"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onNc(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          NC dosyası seç
        </Button>
      </div>
      {info && <p className="mb-2 text-sm text-ok">{info}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Her satıra bir takım ID\n605010\n605022"}
        className="mb-4 min-h-28 w-full rounded-md border border-border bg-bg p-3 font-mono text-sm"
      />
      {tools.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini n={tools.length} l="Takım" />
            <Mini n={ok} l="Yeterli" tone="ok" />
            <Mini n={low} l="Düşük" tone="warn" />
            <Mini n={zero} l="Stok 0" tone="danger" />
            <Mini n={missing} l="Kayıt yok" />
          </div>
          <ToolTable
            rows={rows.map((r) => ({
              id: r.id,
              sap: r.sap,
              qty: r.qty,
              reorder: r.reorder,
              item: r.item,
              problem: !r.item || r.item.qty === 0 || r.item.qty < r.item.reorder,
            }))}
          />
        </>
      )}
    </section>
  );
}

function Mini({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-center">
      <div
        className={cn(
          "font-mono text-xl font-semibold tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {n}
      </div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}

function ManagePanel() {
  const programs = useStockStore((s) => s.programs);
  const saveProgram = useStockStore((s) => s.saveProgram);
  const deleteProgram = useStockStore((s) => s.deleteProgram);
  const [name, setName] = useState("");
  const [tools, setTools] = useState("");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-semibold">Program yönetimi</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm text-muted">Elle ekle / güncelle</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Program adı"
            className="mb-2 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          />
          <textarea
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            placeholder="Takım ID listesi"
            className="mb-2 min-h-32 w-full rounded-md border border-border bg-bg p-3 font-mono text-sm"
          />
          <Button
            onClick={() => {
              const n = name.trim();
              const t = parseToolList(tools);
              if (!n) return toast.error("Program adı gerekli");
              if (!t.length) return toast.error("En az bir takım girin");
              saveProgram(n, t);
              toast.success(`${n} kaydedildi`);
              setName("");
              setTools("");
            }}
          >
            Kaydet
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {Object.keys(programs)
            .sort()
            .map((n) => (
              <div
                key={n}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2"
              >
                <div>
                  <div className="font-medium">{n}</div>
                  <div className="text-xs text-muted">{programs[n].length} takım</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setName(n);
                      setTools(programs[n].join("\n"));
                    }}
                  >
                    Düzenle
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      deleteProgram(n);
                      toast.success("Silindi");
                    }}
                  >
                    Sil
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

function ExcelPanel() {
  const setStock = useStockStore((s) => s.setStock);
  const mergePrograms = useStockStore((s) => s.mergePrograms);
  const resetSeed = useStockStore((s) => s.resetSeed);
  const excelLabel = useStockStore((s) => s.excelLabel);
  const fileRef = useRef<HTMLInputElement>(null);
  const pull = useServerFn(pullWalterStock);
  const [username, setUsername] = useState("erdogan");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  function onExcel(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseWorkbook(reader.result as ArrayBuffer);
        if (!Object.keys(parsed.stok).length) {
          toast.error("STOK sayfası veya stok sütunları bulunamadı");
          return;
        }
        setStock(
          parsed.stok,
          parsed.alts,
          `${file.name} — ${new Date().toLocaleString("tr-TR")}`,
        );
        if (Object.keys(parsed.programs).length) mergePrograms(parsed.programs);
        toast.success(`${Object.keys(parsed.stok).length} takım yüklendi`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Excel okunamadı");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function onWalter() {
    setBusy(true);
    try {
      const res = await pull({
        data: { username, password, apiKey: apiKey || undefined },
      });
      setStock(res.stok, res.alts, res.label);
      setPassword("");
      toast.success(`${res.count} takım Walter'dan alındı`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Walter çekilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-2 text-lg font-semibold">Walter'dan otomatik çek</h2>
        <p className="mb-4 text-sm text-muted">
          Giriş adresi: toolstation.walter-tools.com/adminportalidentity/Account/Login
          (waltertoolsturkey). Paylaştığınız bağlantıdaki state kodu kısa süre
          sonra geçersiz olur; uygulama aynı giriş sayfasını her seferinde yeni
          oturumla açar. Şifre kaydedilmez.
        </p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="Kullanıcı adı"
            className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="Şifre"
            className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm"
          />
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder="İsteğe bağlı API anahtarı (Yönetim → Entegrasyon)"
            className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm sm:col-span-2"
          />
        </div>
        <Button onClick={onWalter} disabled={busy || !username || !password}>
          <CloudDownload className="size-4" />
          {busy ? "Çekiliyor…" : "Walter'dan çek"}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-2 text-lg font-semibold">Haftalık Excel</h2>
        <p className="mb-4 text-sm text-muted">
          STOK + DB sayfaları olan .xlsx, veya portal raporu{" "}
          <strong className="text-fg">3 - Stok</strong>. Aktif kaynak: {excelLabel}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onExcel(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="size-4" />
            Excel yükle
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              resetSeed();
              toast.success("Gömülü listeye dönüldü");
            }}
          >
            Gömülü listeye dön
          </Button>
        </div>
      </div>
    </section>
  );
}

function SearchPanel() {
  const stok = useStockStore((s) => s.stok);
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();
  const matches = nq
    ? Object.entries(stok)
        .filter(
          ([id, v]) =>
            id.toLowerCase().includes(nq) || v.sap.toLowerCase().includes(nq),
        )
        .slice(0, 80)
    : [];

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-semibold">Takım / SAP ara</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Takım ID veya SAP"
        className="mb-4 min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
      />
      {nq && matches.length === 0 && (
        <p className="text-sm text-muted">Sonuç yok</p>
      )}
      {matches.length > 0 && (
        <ToolTable
          rows={matches.map(([id, v]) => ({
            id,
            sap: v.sap,
            qty: v.qty,
            reorder: v.reorder,
            item: v,
          }))}
        />
      )}
    </section>
  );
}

function ToolTable({
  rows,
}: {
  rows: {
    id: string;
    sap: string;
    qty: number | null;
    reorder: number | null;
    item?: StockItem;
    problem?: boolean;
  }[];
}) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted">Kayıt yok</p>;
  }
  return (
    <div className="max-h-[58vh] overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Takım</th>
            <th className="px-3 py-2">SAP</th>
            <th className="px-3 py-2">Stok</th>
            <th className="px-3 py-2">Sipariş</th>
            <th className="px-3 py-2">Durum</th>
            <th className="px-3 py-2">Alternatifler</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn("border-t border-border", r.problem && "bg-danger/5")}
            >
              <td className="px-3 py-2 font-mono font-semibold">{r.id}</td>
              <td className="px-3 py-2 font-mono text-muted">{r.sap || "—"}</td>
              <td
                className={cn(
                  "px-3 py-2 font-mono tabular-nums",
                  r.qty != null &&
                    r.reorder != null &&
                    r.qty < r.reorder &&
                    "font-bold text-danger",
                  r.qty != null &&
                    r.reorder != null &&
                    r.qty >= r.reorder &&
                    "text-ok",
                )}
              >
                {r.qty ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">
                {r.reorder ?? "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge item={r.item} />
              </td>
              <td className="px-3 py-2">
                <AltChips toolId={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
