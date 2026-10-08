import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seed } from "./seed-data";
import type { AltsMap, ProgramsMap, StockMap } from "./types";

type StockState = {
  stok: StockMap;
  alts: AltsMap;
  programs: ProgramsMap;
  excelLabel: string;
  hydrated: boolean;
  setHydrated: () => void;
  setStock: (stok: StockMap, alts: AltsMap, label: string) => void;
  mergePrograms: (programs: ProgramsMap) => void;
  saveProgram: (name: string, tools: string[]) => void;
  deleteProgram: (name: string) => void;
  resetSeed: () => void;
};

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      stok: seed.stok,
      alts: seed.alts,
      programs: seed.programs,
      excelLabel: "Gömülü STAMA listesi",
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setStock: (stok, alts, excelLabel) =>
        set((s) => ({
          stok,
          alts: Object.keys(alts).length ? alts : s.alts,
          excelLabel,
        })),
      mergePrograms: (programs) =>
        set((s) => ({ programs: { ...s.programs, ...programs } })),
      saveProgram: (name, tools) =>
        set((s) => ({ programs: { ...s.programs, [name]: tools } })),
      deleteProgram: (name) =>
        set((s) => {
          const next = { ...s.programs };
          delete next[name];
          return { programs: next };
        }),
      resetSeed: () =>
        set({
          stok: seed.stok,
          alts: seed.alts,
          programs: seed.programs,
          excelLabel: "Gömülü STAMA listesi",
        }),
    }),
    {
      name: "takim-stok-v1",
      skipHydration: true,
      partialize: (s) => ({
        stok: s.stok,
        alts: s.alts,
        programs: s.programs,
        excelLabel: s.excelLabel,
      }),
    },
  ),
);
