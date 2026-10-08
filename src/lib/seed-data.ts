import type { AltsMap, ProgramsMap, StockMap } from "./types";
import raw from "./seed-data.json";

export const seed = raw as {
  stok: StockMap;
  alts: AltsMap;
  programs: ProgramsMap;
};
