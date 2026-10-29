import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");

export const FEED_HOST = "https://supplier.example";

/** Offline fetch serving the fixtures; records every request. */
export function fixtureFetch(log: string[] = []): typeof fetch {
  const routes: Record<string, string> = {
    "/robots.txt": "robots.txt",
    "/feeds/supplier.csv": "supplier.csv",
    "/feeds/supplier.json": "supplier.json",
    "/feeds/supplier.html": "supplier.html",
    "/private/secret.csv": "supplier.csv",
    "/private/public-feed.csv": "supplier.csv",
  };
  return (async (input: string | URL | Request) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    log.push(u.pathname);
    const file = routes[u.pathname];
    return file ? new Response(fixture(file), { status: 200 }) : new Response("not found", { status: 404 });
  }) as typeof fetch;
}
