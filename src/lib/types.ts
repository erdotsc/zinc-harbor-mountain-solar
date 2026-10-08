export type StockItem = {
  sap: string;
  qty: number;
  reorder: number;
};

export type StockMap = Record<string, StockItem>;
export type AltsMap = Record<string, string[]>;
export type ProgramsMap = Record<string, string[]>;

export type CheckRow = {
  id: string;
  sap: string;
  qty: number | null;
  reorder: number | null;
  found: boolean;
  alts: { id: string; qty: number | null }[];
};
