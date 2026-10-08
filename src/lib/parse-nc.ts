/** Fanuc / STAMA .pch — tools listed as Txxxxx between M101 and M105. */
export function parseNcText(text: string): { name: string | null; tools: string[] } {
  const tools: string[] = [];
  const seen = new Set<string>();
  const add = (tid: string) => {
    const t = tid.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      tools.push(t);
    }
  };

  const block = text.match(/M101\b([\s\S]*?)M105\b/i);
  if (block) {
    for (const m of block[1].matchAll(/\bT(\d{5,})\b/g)) add(m[1]);
  }
  if (!tools.length) {
    for (const m of text.matchAll(/\bT(\d{5,})\b/g)) add(m[1]);
  }
  for (const m of text.matchAll(/\(TOOL\s*=\s*(\d{5,})\)/gi)) add(m[1]);

  let name: string | null = null;
  const product = text.match(/\(PRODUCT NAME\s*=\s*([^\)]+)\)/i);
  if (product) name = product[1].trim();
  if (!name) {
    const header = text.match(/:\d+\(([^\)]+)\)/);
    if (header) name = header[1].trim();
  }
  return { name, tools };
}

export function parseToolList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;\s]+/)) {
    const s = part.trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
