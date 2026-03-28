import { raw as rawProduct, type Adapter, type RawProduct } from "../types.js";

function splitRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const csvAdapter: Adapter = {
  name: "csv",
  async parse(raw: string): Promise<RawProduct[]> {
    const [header, ...rows] = splitRows(raw);
    if (!header) return [];
    const cols = header.map((h) => h.trim().toLowerCase());
    return rows.map((r) => {
      const get = (name: string) => r[cols.indexOf(name)]?.trim();
      return rawProduct({
        sku: get("sku"),
        title: get("title"),
        price: get("price"),
        stock: get("stock"),
        vendor: get("vendor"),
      });
    });
  },
};
