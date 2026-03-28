import type { Adapter } from "../types.js";
import { csvAdapter } from "./csv.js";
import { htmlAdapter } from "./html.js";
import { jsonAdapter } from "./json.js";

export { csvAdapter, htmlAdapter, jsonAdapter };
export const adapters: Record<string, Adapter> = {
  csv: csvAdapter,
  json: jsonAdapter,
  html: htmlAdapter,
};
